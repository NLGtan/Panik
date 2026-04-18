import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";
import fs from "node:fs";
import path from "node:path";

const WAD = 10n ** 18n;
const PRICE_SCALE = 10n ** 8n;

function encodeV3Path(tokenIn: string, fee: number, tokenOut: string): string {
  return ethers.solidityPacked(["address", "uint24", "address"], [tokenIn, fee, tokenOut]);
}

function getSolidityFilesRecursively(root: string): string[] {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...getSolidityFilesRecursively(fullPath));
    } else if (entry.isFile() && fullPath.endsWith(".sol")) {
      files.push(fullPath);
    }
  }

  return files;
}

describe("PANIK Phase 0 - Smart Contract Layer", function () {
  async function deployFixture() {
    const [deployer, user, other] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const MockDataProvider = await ethers.getContractFactory("MockAaveProtocolDataProvider");
    const MockPool = await ethers.getContractFactory("MockAavePool");
    const MockRouter = await ethers.getContractFactory("MockUniversalRouter");
    const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
    const LockChecker = await ethers.getContractFactory("LockChecker");
    const AaveAdapter = await ethers.getContractFactory("AaveAdapter");
    const SwapAdapter = await ethers.getContractFactory("SwapAdapter");
    const PanikExecutor = await ethers.getContractFactory("PanikExecutor");

    const usdc: any = await MockERC20.deploy("USDC", "USDC", 18);
    const weth: any = await MockERC20.deploy("WETH", "WETH", 18);
    const aUsdc: any = await MockERC20.deploy("aUSDC", "aUSDC", 18);
    const aWeth: any = await MockERC20.deploy("aWETH", "aWETH", 18);

    const dataProvider: any = await MockDataProvider.deploy();
    const pool: any = await MockPool.deploy(await dataProvider.getAddress());
    const router: any = await MockRouter.deploy();
    const marketOracle: any = await MockPriceOracle.deploy();
    const mockOracle: any = await MockPriceOracle.deploy();

    const lockChecker: any = await LockChecker.deploy(await dataProvider.getAddress(), 3_600);
    const aaveAdapter: any = await AaveAdapter.deploy(await pool.getAddress());
    const swapAdapter: any = await SwapAdapter.deploy(await router.getAddress(), await usdc.getAddress());

    const initialUserVariableDebt = 100n * WAD;
    const initialUserCollateral = 1n * WAD;

    const reserveConfigTemplate = {
      decimals: 18n,
      ltv: 0n,
      liquidationThreshold: 0n,
      liquidationBonus: 0n,
      reserveFactor: 0n,
      usageAsCollateralEnabled: true,
      borrowingEnabled: true,
      stableBorrowRateEnabled: true,
      isActive: true,
      isFrozen: false,
    };

    const reserveDataTemplate = {
      availableLiquidity: 1_000_000n * WAD,
      totalStableDebt: 0n,
      totalVariableDebt: 0n,
      liquidityRate: 0n,
      variableBorrowRate: 0n,
      stableBorrowRate: 0n,
      averageStableBorrowRate: 0n,
      liquidityIndex: 0n,
      variableBorrowIndex: 0n,
      lastUpdateTimestamp: BigInt(await time.latest()),
    };

    await dataProvider.setReserveConfigurationData(await usdc.getAddress(), reserveConfigTemplate);
    await dataProvider.setReserveConfigurationData(await weth.getAddress(), reserveConfigTemplate);

    await dataProvider.setReserveData(await usdc.getAddress(), reserveDataTemplate);
    await dataProvider.setReserveData(await weth.getAddress(), reserveDataTemplate);

    await dataProvider.setReserveTokens(await usdc.getAddress(), await aUsdc.getAddress(), ethers.ZeroAddress, ethers.ZeroAddress);
    await dataProvider.setReserveTokens(await weth.getAddress(), await aWeth.getAddress(), ethers.ZeroAddress, ethers.ZeroAddress);

    await dataProvider.setUserReserveData(user.address, await usdc.getAddress(), {
      currentATokenBalance: 0n,
      currentStableDebt: 0n,
      currentVariableDebt: initialUserVariableDebt,
      principalStableDebt: 0n,
      scaledVariableDebt: 0n,
      stableBorrowRate: 0n,
      liquidityRate: 0n,
      stableRateLastUpdated: BigInt((await time.latest()) - 7_200),
      usageAsCollateralEnabled: false,
    });

    await dataProvider.setUserReserveData(user.address, await weth.getAddress(), {
      currentATokenBalance: initialUserCollateral,
      currentStableDebt: 0n,
      currentVariableDebt: 0n,
      principalStableDebt: 0n,
      scaledVariableDebt: 0n,
      stableBorrowRate: 0n,
      liquidityRate: 0n,
      stableRateLastUpdated: BigInt((await time.latest()) - 7_200),
      usageAsCollateralEnabled: true,
    });

    await pool.setUserAccountData(user.address, {
      totalCollateralBase: 2_000n * PRICE_SCALE,
      totalDebtBase: 100n * PRICE_SCALE,
      availableBorrowsBase: 0n,
      currentLiquidationThreshold: 0n,
      ltv: 0n,
      healthFactor: 1n * WAD,
    });

    await marketOracle.setPrice(await usdc.getAddress(), 1n * PRICE_SCALE);
    await marketOracle.setPrice(await weth.getAddress(), 2_000n * PRICE_SCALE);
    await mockOracle.setPrice(await usdc.getAddress(), 1n * PRICE_SCALE);
    await mockOracle.setPrice(await weth.getAddress(), 2_000n * PRICE_SCALE);

    await usdc.mint(user.address, 5_000n * WAD);
    await weth.mint(await pool.getAddress(), 100n * WAD);
    await weth.mint(await router.getAddress(), 10_000_000n * WAD);
    await usdc.mint(await router.getAddress(), 10_000_000n * WAD);
    await aWeth.mint(user.address, initialUserCollateral);

    await router.setRateWad(await weth.getAddress(), 2_000n * WAD);

    const executor: any = await PanikExecutor.deploy(
      await usdc.getAddress(),
      await dataProvider.getAddress(),
      await marketOracle.getAddress(),
      await mockOracle.getAddress(),
      await lockChecker.getAddress(),
      await aaveAdapter.getAddress(),
      await swapAdapter.getAddress(),
      [await weth.getAddress()],
      [encodeV3Path(await weth.getAddress(), 3_000, await usdc.getAddress())],
      [9_500],
      [await weth.getAddress()],
      [encodeV3Path(await usdc.getAddress(), 3_000, await weth.getAddress())],
      [12_000],
      [],
      [await weth.getAddress(), await usdc.getAddress()],
      3_600
    );

    await aaveAdapter.setExecutor(await executor.getAddress());
    await swapAdapter.setExecutor(await executor.getAddress());

    const maxUint = ethers.MaxUint256;
    await usdc.connect(user).approve(await executor.getAddress(), maxUint);
    await aWeth.connect(user).approve(await executor.getAddress(), maxUint);

    return {
      deployer,
      user,
      other,
      usdc,
      weth,
      aUsdc,
      aWeth,
      dataProvider,
      pool,
      router,
      marketOracle,
      mockOracle,
      lockChecker,
      aaveAdapter,
      swapAdapter,
      executor,
      initialUserVariableDebt,
      initialUserCollateral,
    };
  }

  it("successful atomicExit path with event emission and final USDC sent to msg.sender", async function () {
    const { user, usdc, weth, executor, initialUserVariableDebt } = await loadFixture(deployFixture);

    const userUsdcBefore = await usdc.balanceOf(user.address);

    const tx = await executor.connect(user).atomicExit([await weth.getAddress(), await usdc.getAddress()]);
    await expect(tx).to.emit(executor, "ExitCompleted").withArgs(user.address, anyValue, anyValue, anyValue);

    const receipt = await tx.wait();
    const parsed = receipt!.logs
      .map((log: any) => {
        try {
          return executor.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .filter((v: any): v is NonNullable<typeof v> => v !== null);

    const event = parsed.find((entry: any) => entry.name === "ExitCompleted");
    expect(event).to.not.equal(undefined);

    const usdcReceived = event!.args.usdcReceived as bigint;
    const closed = event!.args.closed as string[];
    const locked = event!.args.locked as string[];

    expect(usdcReceived).to.be.gt(0n);
    expect(closed).to.deep.equal([await weth.getAddress()]);
    expect(locked).to.deep.equal([]);

    const userUsdcAfter = await usdc.balanceOf(user.address);
    expect(userUsdcAfter).to.equal(userUsdcBefore - initialUserVariableDebt + usdcReceived);
    expect(await usdc.balanceOf(await executor.getAddress())).to.equal(0n);
  });

  it("repays non-USDC debt using upfront USDC via debt swap route", async function () {
    const { user, usdc, weth, dataProvider, pool, router, executor } = await loadFixture(deployFixture);

    const wethDebt = 2n * 10n ** 17n; // 0.2 WETH

    await dataProvider.setUserReserveData(user.address, await usdc.getAddress(), {
      currentATokenBalance: 0n,
      currentStableDebt: 0n,
      currentVariableDebt: 0n,
      principalStableDebt: 0n,
      scaledVariableDebt: 0n,
      stableBorrowRate: 0n,
      liquidityRate: 0n,
      stableRateLastUpdated: BigInt((await time.latest()) - 7_200),
      usageAsCollateralEnabled: false,
    });

    await dataProvider.setUserReserveData(user.address, await weth.getAddress(), {
      currentATokenBalance: 1n * WAD,
      currentStableDebt: 0n,
      currentVariableDebt: wethDebt,
      principalStableDebt: 0n,
      scaledVariableDebt: 0n,
      stableBorrowRate: 0n,
      liquidityRate: 0n,
      stableRateLastUpdated: BigInt((await time.latest()) - 7_200),
      usageAsCollateralEnabled: true,
    });

    await pool.setUserAccountData(user.address, {
      totalCollateralBase: 2_000n * PRICE_SCALE,
      totalDebtBase: 400n * PRICE_SCALE,
      availableBorrowsBase: 0n,
      currentLiquidationThreshold: 0n,
      ltv: 0n,
      healthFactor: 1n * WAD,
    });

    await router.setRateWad(await usdc.getAddress(), 5n * 10n ** 14n); // 1 USDC -> 0.0005 WETH

    expect(await weth.balanceOf(user.address)).to.equal(0n);
    const userUsdcBefore = await usdc.balanceOf(user.address);

    await executor.connect(user).atomicExit([await weth.getAddress(), await usdc.getAddress()]);

    const [, , wethDebtAfter] = await dataProvider.getUserReserveData(await weth.getAddress(), user.address);
    expect(wethDebtAfter).to.equal(0n);
    expect(await weth.balanceOf(await executor.getAddress())).to.equal(0n);
    expect(await usdc.balanceOf(user.address)).to.be.gt(userUsdcBefore);
  });

  it("successful partialExit path", async function () {
    const { user, usdc, weth, aWeth, dataProvider, pool, executor } = await loadFixture(deployFixture);

    await dataProvider.setUserReserveData(user.address, await usdc.getAddress(), {
      currentATokenBalance: 0n,
      currentStableDebt: 0n,
      currentVariableDebt: 0n,
      principalStableDebt: 0n,
      scaledVariableDebt: 0n,
      stableBorrowRate: 0n,
      liquidityRate: 0n,
      stableRateLastUpdated: BigInt((await time.latest()) - 7_200),
      usageAsCollateralEnabled: false,
    });

    await pool.setUserAccountData(user.address, {
      totalCollateralBase: 2_000n * PRICE_SCALE,
      totalDebtBase: 0n,
      availableBorrowsBase: 0n,
      currentLiquidationThreshold: 0n,
      ltv: 0n,
      healthFactor: 10n * WAD,
    });

    const extraCollateral = 1n * WAD;
    await aWeth.mint(user.address, extraCollateral);
    await dataProvider.setUserReserveData(user.address, await weth.getAddress(), {
      currentATokenBalance: 2n * WAD,
      currentStableDebt: 0n,
      currentVariableDebt: 0n,
      principalStableDebt: 0n,
      scaledVariableDebt: 0n,
      stableBorrowRate: 0n,
      liquidityRate: 0n,
      stableRateLastUpdated: BigInt((await time.latest()) - 7_200),
      usageAsCollateralEnabled: true,
    });

    const userUsdcBefore = await usdc.balanceOf(user.address);
    const partialAmount = 5n * 10n ** 17n; // 0.5 WETH

    await executor.connect(user).partialExit([await weth.getAddress()], [partialAmount]);

    const userUsdcAfter = await usdc.balanceOf(user.address);
    expect(userUsdcAfter).to.be.gt(userUsdcBefore);
  });

  it("reverts if caller is not an EOA", async function () {
    const { user, weth, executor } = await loadFixture(deployFixture);
    const CallerProxy = await ethers.getContractFactory("CallerProxy");
    const callerProxy: any = await CallerProxy.deploy();

    await expect(
      callerProxy.connect(user).callAtomicExit(await executor.getAddress(), [await weth.getAddress()])
    ).to.be.revertedWithCustomError(executor, "CallerNotEOA");
  });

  it("reverts on duplicate assets in a single exit request", async function () {
    const { user, weth, executor } = await loadFixture(deployFixture);

    await expect(
      executor.connect(user).atomicExit([await weth.getAddress(), await weth.getAddress()])
    ).to.be.revertedWithCustomError(executor, "DuplicateAsset");
  });

  it("restricts adapter state-changing functions to PanikExecutor", async function () {
    const { user, usdc, weth, aaveAdapter, swapAdapter } = await loadFixture(deployFixture);

    await expect(
      aaveAdapter.connect(user).repay(await usdc.getAddress(), 1n, 2n, user.address)
    ).to.be.revertedWithCustomError(aaveAdapter, "CallerNotExecutor");

    await expect(
      aaveAdapter.connect(user).recoverToken(await usdc.getAddress(), user.address, 1n)
    ).to.be.revertedWithCustomError(aaveAdapter, "CallerNotExecutor");

    await expect(
      swapAdapter.connect(user).swapToUSDC({
        tokenIn: await weth.getAddress(),
        amountIn: 1n,
        amountOutMinimum: 0n,
        commands: "0x00",
        inputs: [],
        deadline: BigInt(Math.floor(Date.now() / 1000) + 300),
      })
    ).to.be.revertedWithCustomError(swapAdapter, "CallerNotExecutor");

    await expect(
      swapAdapter.connect(user).recoverToken(await usdc.getAddress(), user.address, 1n)
    ).to.be.revertedWithCustomError(swapAdapter, "CallerNotExecutor");

    await expect(
      swapAdapter.connect(user).swapExactIn(
        {
          tokenIn: await usdc.getAddress(),
          amountIn: 1n,
          amountOutMinimum: 0n,
          commands: "0x00",
          inputs: [],
          deadline: BigInt(Math.floor(Date.now() / 1000) + 300),
        },
        await weth.getAddress()
      )
    ).to.be.revertedWithCustomError(swapAdapter, "CallerNotExecutor");
  });

  it("reverts if slippage is below floor", async function () {
    const { user, weth, usdc, router, executor } = await loadFixture(deployFixture);

    await router.setRateWad(await weth.getAddress(), 1_000n * WAD);

    await expect(
      executor.connect(user).atomicExit([await weth.getAddress(), await usdc.getAddress()])
    ).to.be.reverted;
  });

  it("refunds user when Aave repay consumes less than requested amount", async function () {
    const { user, usdc, weth, dataProvider, pool, aaveAdapter, executor, initialUserVariableDebt } = await loadFixture(
      deployFixture
    );

    await pool.setRepayReturnBps(5_000);

    const userUsdcBefore = await usdc.balanceOf(user.address);
    const tx = await executor.connect(user).atomicExit([await weth.getAddress(), await usdc.getAddress()]);
    const receipt = await tx.wait();

    const parsed = receipt!.logs
      .map((log: any) => {
        try {
          return executor.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .filter((v: any): v is NonNullable<typeof v> => v !== null);
    const event = parsed.find((entry: any) => entry.name === "ExitCompleted");
    expect(event).to.not.equal(undefined);

    const usdcReceived = event!.args.usdcReceived as bigint;
    const expectedRepaid = initialUserVariableDebt / 2n;
    const userUsdcAfter = await usdc.balanceOf(user.address);

    expect(userUsdcAfter).to.equal(userUsdcBefore - expectedRepaid + usdcReceived);
    expect(await usdc.balanceOf(await aaveAdapter.getAddress())).to.equal(0n);

    const [, , variableDebtAfter] = await dataProvider.getUserReserveData(await usdc.getAddress(), user.address);
    expect(variableDebtAfter).to.equal(initialUserVariableDebt - expectedRepaid);
  });

  it("reverts if user lacks required USDC for debt priority repayment", async function () {
    const { user, other, weth, usdc, executor } = await loadFixture(deployFixture);

    const userUsdcBalance = await usdc.balanceOf(user.address);
    await usdc.connect(user).transfer(other.address, userUsdcBalance - 50n * WAD);

    await expect(
      executor.connect(user).atomicExit([await weth.getAddress(), await usdc.getAddress()])
    ).to.be.revertedWithCustomError(executor, "InsufficientDebtAssetBalance");
  });

  it("reverts when reserve is frozen", async function () {
    const { user, weth, dataProvider, executor } = await loadFixture(deployFixture);

    await dataProvider.setReserveConfigurationData(await weth.getAddress(), {
      decimals: 18n,
      ltv: 0n,
      liquidationThreshold: 0n,
      liquidationBonus: 0n,
      reserveFactor: 0n,
      usageAsCollateralEnabled: true,
      borrowingEnabled: true,
      stableBorrowRateEnabled: true,
      isActive: true,
      isFrozen: true,
    });

    await expect(
      executor.connect(user).atomicExit([await weth.getAddress()])
    ).to.be.revertedWithCustomError(executor, "LockedPositions");
  });

  it("reverts when reserve liquidity is zero", async function () {
    const { user, weth, dataProvider, executor } = await loadFixture(deployFixture);

    await dataProvider.setReserveData(await weth.getAddress(), {
      availableLiquidity: 0n,
      totalStableDebt: 0n,
      totalVariableDebt: 0n,
      liquidityRate: 0n,
      variableBorrowRate: 0n,
      stableBorrowRate: 0n,
      averageStableBorrowRate: 0n,
      liquidityIndex: 0n,
      variableBorrowIndex: 0n,
      lastUpdateTimestamp: BigInt(await time.latest()),
    });

    await expect(
      executor.connect(user).atomicExit([await weth.getAddress()])
    ).to.be.revertedWithCustomError(executor, "LockedPositions");
  });

  it("revert path leaves no partial state changes", async function () {
    const { user, weth, usdc, aWeth, dataProvider, router, executor } = await loadFixture(deployFixture);

    await router.setRateWad(await weth.getAddress(), 900n * WAD);

    const userUsdcBefore = await usdc.balanceOf(user.address);
    const userAWethBefore = await aWeth.balanceOf(user.address);
    const [, , variableDebtBefore] = await dataProvider.getUserReserveData(await usdc.getAddress(), user.address);

    await expect(
      executor.connect(user).atomicExit([await weth.getAddress(), await usdc.getAddress()])
    ).to.be.reverted;

    const userUsdcAfter = await usdc.balanceOf(user.address);
    const userAWethAfter = await aWeth.balanceOf(user.address);
    const [, , variableDebtAfter] = await dataProvider.getUserReserveData(await usdc.getAddress(), user.address);

    expect(userUsdcAfter).to.equal(userUsdcBefore);
    expect(userAWethAfter).to.equal(userAWethBefore);
    expect(variableDebtAfter).to.equal(variableDebtBefore);
  });

  it("never references SwapRouter02", async function () {
    const contractsDir = path.resolve(process.cwd(), "contracts");
    const files = getSolidityFilesRecursively(contractsDir);

    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      expect(content.includes("SwapRouter02"), `${file} references SwapRouter02`).to.equal(false);
    }
  });

  it("has no owner/admin function surface on PanikExecutor", async function () {
    const { executor } = await loadFixture(deployFixture);

    const functionNames = executor.interface.fragments
      .filter((fragment: any) => fragment.type === "function")
      .map((fragment: any) => fragment.name);

    const forbidden = [
      "owner",
      "transferOwnership",
      "renounceOwnership",
      "pause",
      "unpause",
      "upgradeTo",
      "admin",
      "setAdmin",
    ];

    for (const name of forbidden) {
      expect(functionNames).to.not.include(name);
    }
  });

  it("exposes tracked assets for scan flows", async function () {
    const { executor, usdc, weth } = await loadFixture(deployFixture);
    const tracked = await executor.getTrackedAssets();

    expect(tracked).to.include(await usdc.getAddress());
    expect(tracked).to.include(await weth.getAddress());
  });
});
