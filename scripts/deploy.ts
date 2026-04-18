import { config as loadEnv } from "dotenv";
import { ethers } from "hardhat";
import fs from "node:fs";
import path from "node:path";

loadEnv();

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value.trim();
}

function csv(name: string): string[] {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function uniqueAddresses(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    if (!ethers.isAddress(value)) {
      throw new Error(`Invalid address value: ${value}`);
    }
    const normalized = ethers.getAddress(value);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
  }

  return output;
}

async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);
  let nextNonce = await ethers.provider.getTransactionCount(
    deployer.address,
    "pending"
  );

  const usdc = requiredEnv("USDC");
  const aavePool = requiredEnv("AAVE_POOL");
  const dataProvider = requiredEnv("AAVE_PROTOCOL_DATA_PROVIDER");
  const marketOracle = requiredEnv("AAVE_ORACLE");
  const mockOracle = requiredEnv("MOCK_ORACLE");
  const universalRouter = requiredEnv("UNIVERSAL_ROUTER");

  const stableDebtCooldownSeconds = BigInt(
    process.env.STABLE_DEBT_COOLDOWN_SECONDS ?? "3600"
  );
  const swapDeadlineBufferSeconds = BigInt(
    process.env.SWAP_DEADLINE_BUFFER_SECONDS ?? "300"
  );

  const swapAssets = csv("SWAP_ASSETS");
  const swapPaths = csv("SWAP_PATHS");
  const swapMinOutBpsRaw = csv("SWAP_MIN_OUT_BPS");
  const mockOracleAssets = csv("MOCK_ORACLE_ASSETS");
  const trackedAssetsRaw = csv("TRACKED_ASSETS");

  if (
    swapAssets.length !== swapPaths.length ||
    swapAssets.length !== swapMinOutBpsRaw.length
  ) {
    throw new Error(
      "Swap config length mismatch: SWAP_ASSETS, SWAP_PATHS, SWAP_MIN_OUT_BPS must match."
    );
  }

  const swapMinOutBps = swapMinOutBpsRaw.map((value) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10_000) {
      throw new Error(`Invalid SWAP_MIN_OUT_BPS value: ${value}`);
    }
    return parsed;
  });

  const trackedAssets = uniqueAddresses([
    usdc,
    ...swapAssets,
    ...mockOracleAssets,
    ...trackedAssetsRaw,
  ]);

  console.log("Deploying LockChecker...");
  const LockChecker = await ethers.getContractFactory("LockChecker");
  const lockChecker = await LockChecker.deploy(
    dataProvider,
    stableDebtCooldownSeconds,
    { nonce: nextNonce++ }
  );
  await lockChecker.waitForDeployment();

  console.log("Deploying AaveAdapter...");
  const AaveAdapter = await ethers.getContractFactory("AaveAdapter");
  const aaveAdapter = await AaveAdapter.deploy(aavePool, {
    nonce: nextNonce++,
  });
  await aaveAdapter.waitForDeployment();

  console.log("Deploying SwapAdapter...");
  const SwapAdapter = await ethers.getContractFactory("SwapAdapter");
  const swapAdapter = await SwapAdapter.deploy(universalRouter, usdc, {
    nonce: nextNonce++,
  });
  await swapAdapter.waitForDeployment();

  console.log("Deploying PanikExecutor...");
  const PanikExecutor = await ethers.getContractFactory("PanikExecutor");
  const panikExecutor = await PanikExecutor.deploy(
    usdc,
    dataProvider,
    marketOracle,
    mockOracle,
    await lockChecker.getAddress(),
    await aaveAdapter.getAddress(),
    await swapAdapter.getAddress(),
    swapAssets,
    swapPaths,
    swapMinOutBps,
    mockOracleAssets,
    trackedAssets,
    swapDeadlineBufferSeconds,
    { nonce: nextNonce++ }
  );
  await panikExecutor.waitForDeployment();
  const panikExecutorAddress = await panikExecutor.getAddress();

  console.log("Binding executor access on adapters...");
  const bindAaveTx = await aaveAdapter.setExecutor(panikExecutorAddress, {
    nonce: nextNonce++,
  });
  await bindAaveTx.wait();

  const bindSwapTx = await swapAdapter.setExecutor(panikExecutorAddress, {
    nonce: nextNonce++,
  });
  await bindSwapTx.wait();

  const deployment = {
    chainId: 84532,
    network: "baseSepolia",
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    addresses: {
      lockChecker: await lockChecker.getAddress(),
      aaveAdapter: await aaveAdapter.getAddress(),
      swapAdapter: await swapAdapter.getAddress(),
      panikExecutor: panikExecutorAddress,
    },
    config: {
      usdc,
      aavePool,
      dataProvider,
      marketOracle,
      mockOracle,
      universalRouter,
      stableDebtCooldownSeconds: stableDebtCooldownSeconds.toString(),
      swapDeadlineBufferSeconds: swapDeadlineBufferSeconds.toString(),
      swapAssets,
      swapPaths,
      swapMinOutBps,
      mockOracleAssets,
      trackedAssets,
    },
  };

  const outputDir = path.resolve(process.cwd(), "deploy");
  const outputFile = path.join(outputDir, "addresses.base-sepolia.json");
  const executorOnlyOutputFile = path.join(
    outputDir,
    "panik-executor.base-sepolia.json"
  );
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(deployment, null, 2));

  const executorOnlyDeployment = {
    chainId: deployment.chainId,
    network: deployment.network,
    deployedAt: deployment.deployedAt,
    deployer: deployment.deployer,
    panikExecutor: deployment.addresses.panikExecutor,
    reused: {
      lockChecker: deployment.addresses.lockChecker,
      aaveAdapter: deployment.addresses.aaveAdapter,
      swapAdapter: deployment.addresses.swapAdapter,
    },
    config: {
      usdc,
      dataProvider,
      marketOracle,
      mockOracle,
      swapDeadlineBufferSeconds: swapDeadlineBufferSeconds.toString(),
      swapAssets,
      swapPaths,
      swapMinOutBps,
      mockOracleAssets,
      trackedAssets,
    },
  };
  fs.writeFileSync(
    executorOnlyOutputFile,
    JSON.stringify(executorOnlyDeployment, null, 2)
  );

  console.log("Deployment complete.");
  console.log(JSON.stringify(deployment, null, 2));
  console.log(`Saved deployment file: ${outputFile}`);
  console.log(`Saved executor snapshot: ${executorOnlyOutputFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
