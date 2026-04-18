// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAaveProtocolDataProvider} from "./interfaces/IAaveProtocolDataProvider.sol";

contract LockChecker {
    bytes4 private constant GET_RESERVE_DATA_SELECTOR =
        bytes4(keccak256("getReserveData(address)"));
    uint256 private constant ABI_WORD_SIZE = 32;
    uint256 private constant RESERVE_DATA_WORDS_LEGACY = 10;
    uint256 private constant RESERVE_DATA_WORDS_AAVE_V3 = 12;

    struct LockStatus {
        bool stableDebtCooldown;
        bool frozenReserve;
        bool zeroLiquidityReserve;
    }

    IAaveProtocolDataProvider public immutable dataProvider;
    uint256 public immutable stableDebtCooldownSeconds;

    constructor(address dataProvider_, uint256 stableDebtCooldownSeconds_) {
        require(dataProvider_ != address(0), "LockChecker: zero data provider");
        dataProvider = IAaveProtocolDataProvider(dataProvider_);
        stableDebtCooldownSeconds = stableDebtCooldownSeconds_;
    }

    function getLockedAssets(
        address user,
        address[] calldata assets
    ) external view returns (address[] memory locked) {
        address[] memory temp = new address[](assets.length);
        uint256 count;

        for (uint256 i; i < assets.length; ++i) {
            LockStatus memory status = _classify(user, assets[i]);
            if (_isLocked(status)) {
                temp[count++] = assets[i];
            }
        }

        locked = _shrink(temp, count);
    }

    function getLockStatus(
        address user,
        address asset
    ) external view returns (LockStatus memory) {
        return _classify(user, asset);
    }

    function _classify(
        address user,
        address asset
    ) internal view returns (LockStatus memory status) {
        (
            ,
            uint256 currentStableDebt,
            ,
            ,
            ,
            ,
            ,
            uint40 stableRateLastUpdated,

        ) = dataProvider.getUserReserveData(asset, user);

        if (currentStableDebt > 0 && stableDebtCooldownSeconds > 0) {
            uint256 cooldownEnd = uint256(stableRateLastUpdated) +
                stableDebtCooldownSeconds;
            status.stableDebtCooldown = block.timestamp < cooldownEnd;
        }

        (
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            bool isFrozen
        ) = dataProvider.getReserveConfigurationData(asset);
        status.frozenReserve = isFrozen;

        uint256 availableLiquidity = _readReserveLiquidity(asset);
        status.zeroLiquidityReserve = availableLiquidity == 0;
    }

    /// @dev Aave data providers may return different reserve-data tuple shapes
    /// depending on deployment/version. We parse by return length and fallback
    /// to underlying balance on the aToken when needed.
    function _readReserveLiquidity(
        address asset
    ) internal view returns (uint256 availableLiquidity) {
        bytes memory callData = abi.encodeWithSelector(
            GET_RESERVE_DATA_SELECTOR,
            asset
        );
        (bool success, bytes memory result) = address(dataProvider).staticcall(
            callData
        );

        if (success) {
            if (
                result.length == ABI_WORD_SIZE * RESERVE_DATA_WORDS_LEGACY
            ) {
                (
                    availableLiquidity,
                    ,
                    ,
                    ,
                    ,
                    ,
                    ,
                    ,
                    ,

                ) = abi.decode(
                    result,
                    (
                        uint256,
                        uint256,
                        uint256,
                        uint256,
                        uint256,
                        uint256,
                        uint256,
                        uint256,
                        uint256,
                        uint40
                    )
                );
                return availableLiquidity;
            }

            if (
                result.length == ABI_WORD_SIZE * RESERVE_DATA_WORDS_AAVE_V3
            ) {
                (
                    ,
                    ,
                    uint256 totalAToken,
                    ,
                    ,
                    ,
                    ,
                    ,
                    ,
                    ,
                    ,

                ) = abi.decode(
                    result,
                    (
                        uint256,
                        uint256,
                        uint256,
                        uint256,
                        uint256,
                        uint256,
                        uint256,
                        uint256,
                        uint256,
                        uint256,
                        uint256,
                        uint40
                    )
                );

                uint256 aTokenUnderlyingBalance = _readATokenUnderlyingBalance(
                    asset
                );
                return
                    aTokenUnderlyingBalance > 0
                        ? aTokenUnderlyingBalance
                        : totalAToken;
            }
        }

        return _readATokenUnderlyingBalance(asset);
    }

    function _readATokenUnderlyingBalance(
        address asset
    ) internal view returns (uint256) {
        (address aTokenAddress, , ) = dataProvider.getReserveTokensAddresses(
            asset
        );
        if (aTokenAddress == address(0)) {
            return 0;
        }

        try IERC20(asset).balanceOf(aTokenAddress) returns (uint256 balance) {
            return balance;
        } catch {
            return 0;
        }
    }

    function _isLocked(LockStatus memory status) internal pure returns (bool) {
        return
            status.stableDebtCooldown ||
            status.frozenReserve ||
            status.zeroLiquidityReserve;
    }

    function _shrink(
        address[] memory values,
        uint256 size
    ) internal pure returns (address[] memory result) {
        result = new address[](size);
        for (uint256 i; i < size; ++i) {
            result[i] = values[i];
        }
    }

}
