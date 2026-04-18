// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IAaveProtocolDataProvider} from "./interfaces/IAaveProtocolDataProvider.sol";
import {IAssetOracle} from "./interfaces/IAssetOracle.sol";
import {INonfungiblePositionManager} from "./interfaces/INonfungiblePositionManager.sol";
import {LockChecker} from "./LockChecker.sol";
import {SequenceLib} from "./libraries/SequenceLib.sol";
import {AaveAdapter} from "./adapters/AaveAdapter.sol";
import {SwapAdapter} from "./adapters/SwapAdapter.sol";
import {UniswapAdapter} from "./adapters/UniswapAdapter.sol";

contract PanikExecutor is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error CallerNotEOA();
    error LengthMismatch();
    error LockedPositions(address[] lockedAssets);
    error InsufficientDebtAssetBalance(
        address asset,
        uint256 requiredAmount,
        uint256 availableAmount
    );
    error MissingSwapRoute(address asset);
    error InvalidMinOutBps(address asset, uint16 minOutBps);
    error PriceUnavailable(address asset);
    error MissingAToken(address asset);
    error InvalidOracleDecimals(uint8 decimals);
    error InvalidTrackedAsset(address asset);
    error DuplicateAsset(address asset);
    error InvalidRepayAmount(address asset, uint256 attemptedAmount, uint256 repaidAmount);
    error NftNotOwned(uint256 tokenId);

    event ExitCompleted(
        address user,
        uint256 usdcReceived,
        address[] closed,
        address[] locked
    );

    address public immutable usdc;
    IAaveProtocolDataProvider public immutable dataProvider;
    IAssetOracle public immutable marketOracle;
    IAssetOracle public immutable mockOracle;
    LockChecker public immutable lockChecker;
    AaveAdapter public immutable aaveAdapter;
    SwapAdapter public immutable swapAdapter;
    UniswapAdapter public immutable uniswapAdapter;
    INonfungiblePositionManager public immutable nftManager;
    uint256 public immutable swapDeadlineBuffer;

    mapping(address asset => bytes path) private _swapPathByAsset;
    mapping(address asset => uint16 minOutBps) private _swapMinOutBpsByAsset;
    mapping(address asset => bool enabled) private _swapEnabledByAsset;
    mapping(address asset => bool useMock) private _useMockOracleByAsset;
    mapping(address asset => bool tracked) private _trackedAssetByAsset;
    address[] private _trackedAssets;

    modifier onlyEOA() {
        if (msg.sender != tx.origin) revert CallerNotEOA();
        _;
    }

    constructor(
        address usdc_,
        address dataProvider_,
        address marketOracle_,
        address mockOracle_,
        address lockChecker_,
        address aaveAdapter_,
        address swapAdapter_,
        address uniswapAdapter_,
        address nftManager_,
        address[] memory swapAssets_,
        bytes[] memory swapPaths_,
        uint16[] memory swapMinOutBps_,
        address[] memory mockOracleAssets_,
        address[] memory trackedAssets_,
        uint256 swapDeadlineBuffer_
    ) {
        require(usdc_ != address(0), "PanikExecutor: zero usdc");
        require(dataProvider_ != address(0), "PanikExecutor: zero data provider");
        require(lockChecker_ != address(0), "PanikExecutor: zero lock checker");
        require(aaveAdapter_ != address(0), "PanikExecutor: zero aave adapter");
        require(swapAdapter_ != address(0), "PanikExecutor: zero swap adapter");
        require(uniswapAdapter_ != address(0), "PanikExecutor: zero uniswap adapter");
        require(nftManager_ != address(0), "PanikExecutor: zero nft manager");
        require(
            swapAssets_.length == swapPaths_.length &&
                swapAssets_.length == swapMinOutBps_.length,
            "PanikExecutor: swap config length mismatch"
        );

        usdc = usdc_;
        dataProvider = IAaveProtocolDataProvider(dataProvider_);
        marketOracle = IAssetOracle(marketOracle_);
        mockOracle = IAssetOracle(mockOracle_);
        lockChecker = LockChecker(lockChecker_);
        aaveAdapter = AaveAdapter(aaveAdapter_);
        swapAdapter = SwapAdapter(swapAdapter_);
        uniswapAdapter = UniswapAdapter(uniswapAdapter_);
        nftManager = INonfungiblePositionManager(nftManager_);
        swapDeadlineBuffer = swapDeadlineBuffer_;

        _trackAsset(usdc_);
        for (uint256 i; i < swapAssets_.length; ++i) {
            _swapPathByAsset[swapAssets_[i]] = swapPaths_[i];
            _swapMinOutBpsByAsset[swapAssets_[i]] = swapMinOutBps_[i];
            _swapEnabledByAsset[swapAssets_[i]] = true;
            _trackAsset(swapAssets_[i]);
        }

        for (uint256 i; i < mockOracleAssets_.length; ++i) {
            _useMockOracleByAsset[mockOracleAssets_[i]] = true;
            _trackAsset(mockOracleAssets_[i]);
        }

        for (uint256 i; i < trackedAssets_.length; ++i) {
            _trackAsset(trackedAssets_[i]);
        }
    }

    /// @notice Atomic exit: repay Aave debts, withdraw Aave collateral, exit Uniswap LPs, sweep USDC.
    /// @param aaveAssets Aave reserve addresses to exit.
    /// @param uniswapTokenIds Uniswap V3 LP NFT token IDs to exit.
    function atomicExit(
        address[] calldata aaveAssets,
        uint256[] calldata uniswapTokenIds
    ) external nonReentrant onlyEOA {
        uint256[] memory noPartialAmounts = new uint256[](aaveAssets.length);
        _executeExit(aaveAssets, noPartialAmounts, false, uniswapTokenIds);
    }

    /// @notice Partial exit: repay Aave debts, withdraw partial Aave collateral, exit Uniswap LPs, sweep USDC.
    /// @param aaveAssets Aave reserve addresses to exit.
    /// @param amounts Partial withdrawal amounts for each Aave asset.
    /// @param uniswapTokenIds Uniswap V3 LP NFT token IDs to exit.
    function partialExit(
        address[] calldata aaveAssets,
        uint256[] calldata amounts,
        uint256[] calldata uniswapTokenIds
    ) external nonReentrant onlyEOA {
        if (aaveAssets.length != amounts.length) revert LengthMismatch();
        uint256[] memory partialAmounts = amounts;
        _executeExit(aaveAssets, partialAmounts, true, uniswapTokenIds);
    }

    function getSwapConfig(
        address asset
    )
        external
        view
        returns (bool enabled, bytes memory path, uint16 minOutBps, bool useMockOracle)
    {
        return (
            _swapEnabledByAsset[asset],
            _swapPathByAsset[asset],
            _swapMinOutBpsByAsset[asset],
            _useMockOracleByAsset[asset]
        );
    }

    function getTrackedAssets() external view returns (address[] memory) {
        return _trackedAssets;
    }

    function _executeExit(
        address[] calldata aaveAssets,
        uint256[] memory partialAmounts,
        bool isPartial,
        uint256[] calldata uniswapTokenIds
    ) private {
        if (aaveAssets.length > 0) {
            _validateUniqueAssets(aaveAssets);
        }

        address[] memory locked;
        if (aaveAssets.length > 0) {
            locked = lockChecker.getLockedAssets(msg.sender, aaveAssets);
            if (locked.length > 0) revert LockedPositions(locked);
        } else {
            locked = new address[](0);
        }

        uint256 usdcBefore = IERC20(usdc).balanceOf(address(this));

        // --- Phase 1: Aave debt repay + collateral withdraw ---
        address[] memory closed;
        if (aaveAssets.length > 0) {
            SequenceLib.AssetPosition[] memory positions = _buildPositions(
                msg.sender,
                aaveAssets,
                partialAmounts,
                isPartial
            );

            SequenceLib.ExitSequence memory sequence = SequenceLib.buildExitSequence(
                positions,
                usdc
            );

            (, uint256 totalDebtBaseBefore, , , , uint256 healthFactorBefore) = aaveAdapter
                .getUserAccountData(msg.sender);

            bool didRepay;
            didRepay = _repayDebtActions(sequence.variableDebtRepays) || didRepay;
            didRepay = _repayDebtActions(sequence.stableDebtRepays) || didRepay;

            if (didRepay && totalDebtBaseBefore > 0) {
                aaveAdapter.assertHealthFactorImproved(msg.sender, healthFactorBefore);
            }

            closed = _processWithdrawals(msg.sender, sequence.withdrawals);
        } else {
            closed = new address[](0);
        }

        // --- Phase 2: Uniswap V3 LP exits ---
        for (uint256 i; i < uniswapTokenIds.length; ++i) {
            _exitUniswapPosition(uniswapTokenIds[i]);
        }

        // --- Phase 3: USDC sweep ---
        uint256 usdcAfter = IERC20(usdc).balanceOf(address(this));
        uint256 usdcReceived = usdcAfter - usdcBefore;
        if (usdcReceived > 0) {
            IERC20(usdc).safeTransfer(msg.sender, usdcReceived);
        }

        emit ExitCompleted(msg.sender, usdcReceived, closed, locked);
    }

    /// @dev Transfer NFT from user, exit position via adapter, swap received tokens to USDC.
    function _exitUniswapPosition(uint256 tokenId) private {
        // Transfer NFT from user to this contract
        nftManager.transferFrom(msg.sender, address(uniswapAdapter), tokenId);

        // Exit position: remove liquidity + collect
        (
            address token0,
            uint256 amount0,
            address token1,
            uint256 amount1
        ) = uniswapAdapter.exitPosition(tokenId);

        // Swap token0 to USDC if needed
        if (amount0 > 0 && token0 != usdc) {
            _swapAssetToUsdc(token0, amount0);
        }

        // Swap token1 to USDC if needed
        if (amount1 > 0 && token1 != usdc) {
            _swapAssetToUsdc(token1, amount1);
        }
    }

    function _repayDebtActions(
        SequenceLib.DebtAction[] memory actions
    ) private returns (bool repaidAny) {
        for (uint256 i; i < actions.length; ++i) {
            SequenceLib.DebtAction memory action = actions[i];
            if (action.amount == 0) {
                continue;
            }

            IERC20 debtAsset = IERC20(action.asset);
            uint256 userBalance = debtAsset.balanceOf(msg.sender);
            if (userBalance < action.amount) {
                revert InsufficientDebtAssetBalance(
                    action.asset,
                    action.amount,
                    userBalance
                );
            }

            debtAsset.safeTransferFrom(msg.sender, address(this), action.amount);
            debtAsset.safeTransfer(address(aaveAdapter), action.amount);
            uint256 repaid = aaveAdapter.repay(
                action.asset,
                action.amount,
                action.rateMode,
                msg.sender
            );

            if (repaid > action.amount) {
                revert InvalidRepayAmount(action.asset, action.amount, repaid);
            }

            if (repaid < action.amount) {
                uint256 refundable = action.amount - repaid;
                uint256 adapterBalance = debtAsset.balanceOf(address(aaveAdapter));
                uint256 recoverable = _min(refundable, adapterBalance);
                if (recoverable > 0) {
                    aaveAdapter.recoverToken(action.asset, address(this), recoverable);
                    debtAsset.safeTransfer(msg.sender, recoverable);
                }
            }

            repaidAny = repaidAny || (repaid > 0);
        }
    }

    function _buildPositions(
        address user,
        address[] calldata assets,
        uint256[] memory partialAmounts,
        bool isPartial
    ) private view returns (SequenceLib.AssetPosition[] memory positions) {
        positions = new SequenceLib.AssetPosition[](assets.length);

        for (uint256 i; i < assets.length; ++i) {
            (
                uint256 currentATokenBalance,
                uint256 currentStableDebt,
                uint256 currentVariableDebt,
                ,
                ,
                ,
                ,
                ,

            ) = dataProvider.getUserReserveData(assets[i], user);

            uint256 collateralAmount = currentATokenBalance;
            if (isPartial) {
                collateralAmount = _min(collateralAmount, partialAmounts[i]);
            }

            positions[i] = SequenceLib.AssetPosition({
                asset: assets[i],
                variableDebt: currentVariableDebt,
                stableDebt: currentStableDebt,
                collateralAmount: collateralAmount,
                usdPrice: _getAssetPrice(assets[i])
            });
        }
    }

    function _processWithdrawals(
        address user,
        SequenceLib.WithdrawAction[] memory withdrawals
    ) private returns (address[] memory closed) {
        address[] memory temp = new address[](withdrawals.length);
        uint256 count;

        for (uint256 i; i < withdrawals.length; ++i) {
            SequenceLib.WithdrawAction memory action = withdrawals[i];
            if (action.amount == 0) {
                continue;
            }

            uint256 withdrawn = _withdrawCollateralFromUser(
                user,
                action.asset,
                action.amount
            );
            if (withdrawn == 0) {
                continue;
            }

            temp[count++] = action.asset;

            if (action.asset != usdc) {
                _swapAssetToUsdc(action.asset, withdrawn);
            }
        }

        closed = _shrink(temp, count);
    }

    function _withdrawCollateralFromUser(
        address user,
        address asset,
        uint256 amount
    ) private returns (uint256 withdrawn) {
        (address aTokenAddress, , ) = dataProvider.getReserveTokensAddresses(asset);
        if (aTokenAddress == address(0)) {
            revert MissingAToken(asset);
        }

        IERC20(aTokenAddress).safeTransferFrom(user, address(aaveAdapter), amount);
        withdrawn = aaveAdapter.withdraw(asset, amount, address(this));
    }

    function _swapAssetToUsdc(address asset, uint256 amountIn) private {
        if (!_swapEnabledByAsset[asset]) {
            revert MissingSwapRoute(asset);
        }

        uint256 amountOutMinimum = _computeAmountOutMinimum(asset, amountIn);
        IERC20(asset).safeTransfer(address(swapAdapter), amountIn);

        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(
            address(swapAdapter),
            amountIn,
            amountOutMinimum,
            _swapPathByAsset[asset],
            false
        );

        swapAdapter.swapToUSDC(
            SwapAdapter.SwapRequest({
                tokenIn: asset,
                amountIn: amountIn,
                amountOutMinimum: amountOutMinimum,
                commands: hex"00",
                inputs: inputs,
                deadline: block.timestamp + swapDeadlineBuffer
            })
        );
    }

    /// @dev Phase 0 keeps entrypoint ABI fixed to:
    /// atomicExit(address[],uint256[]) and partialExit(address[],uint256[],uint256[]).
    /// Because no per-swap calldata is available in that ABI, the slippage floor
    /// is enforced from deploy-time per-asset config + oracle prices.
    /// TODO(PHASE0-ABI): move to explicit frontend-provided amountOutMinimum calldata.
    function _computeAmountOutMinimum(
        address asset,
        uint256 amountIn
    ) private view returns (uint256) {
        uint16 minOutBps = _swapMinOutBpsByAsset[asset];
        if (minOutBps == 0 || minOutBps > 10_000) {
            revert InvalidMinOutBps(asset, minOutBps);
        }

        uint256 assetPrice = _getAssetPrice(asset);
        uint256 usdcPrice = _getAssetPrice(usdc);
        if (assetPrice == 0) revert PriceUnavailable(asset);
        if (usdcPrice == 0) revert PriceUnavailable(usdc);

        uint8 assetDecimals = IERC20Metadata(asset).decimals();
        uint8 usdcDecimals = IERC20Metadata(usdc).decimals();
        uint256 assetScale = _pow10(assetDecimals);
        uint256 usdcScale = _pow10(usdcDecimals);

        uint256 usdValue = Math.mulDiv(amountIn, assetPrice, assetScale);
        uint256 expectedOut = Math.mulDiv(usdValue, usdcScale, usdcPrice);
        return Math.mulDiv(expectedOut, minOutBps, 10_000);
    }

    function _getAssetPrice(address asset) private view returns (uint256) {
        if (_useMockOracleByAsset[asset]) {
            uint256 mockPrice = _readPrice(mockOracle, asset);
            if (mockPrice == 0) revert PriceUnavailable(asset);
            return mockPrice;
        }

        uint256 marketPrice = _readPrice(marketOracle, asset);
        if (marketPrice > 0) {
            return marketPrice;
        }

        uint256 fallbackMockPrice = _readPrice(mockOracle, asset);
        if (fallbackMockPrice > 0) {
            return fallbackMockPrice;
        }

        revert PriceUnavailable(asset);
    }

    function _readPrice(
        IAssetOracle oracle,
        address asset
    ) private view returns (uint256 price) {
        if (address(oracle) == address(0)) {
            return 0;
        }

        try oracle.getAssetPrice(asset) returns (uint256 p) {
            price = p;
        } catch {
            price = 0;
        }
    }

    function _pow10(uint8 decimals) private pure returns (uint256 result) {
        if (decimals > 77) revert InvalidOracleDecimals(decimals);

        result = 1;
        for (uint8 i; i < decimals; ++i) {
            result *= 10;
        }
    }

    function _min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }

    function _trackAsset(address asset) private {
        if (asset == address(0)) {
            revert InvalidTrackedAsset(asset);
        }
        if (_trackedAssetByAsset[asset]) {
            return;
        }
        _trackedAssetByAsset[asset] = true;
        _trackedAssets.push(asset);
    }

    function _validateUniqueAssets(address[] calldata assets) private pure {
        for (uint256 i; i < assets.length; ++i) {
            for (uint256 j = i + 1; j < assets.length; ++j) {
                if (assets[i] == assets[j]) {
                    revert DuplicateAsset(assets[i]);
                }
            }
        }
    }

    function _shrink(
        address[] memory values,
        uint256 size
    ) private pure returns (address[] memory result) {
        result = new address[](size);
        for (uint256 i; i < size; ++i) {
            result[i] = values[i];
        }
    }
}
