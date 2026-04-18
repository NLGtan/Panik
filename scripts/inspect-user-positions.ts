import { config as loadEnv } from "dotenv";
import { ethers } from "hardhat";
import fs from "node:fs";
import path from "node:path";

loadEnv();

type DeploymentFile = {
  chainId: number;
  config: {
    dataProvider: string;
  };
};

type ReserveToken = {
  symbol: string;
  tokenAddress: string;
};

type UserReserveData = {
  currentATokenBalance: bigint;
  currentStableDebt: bigint;
  currentVariableDebt: bigint;
};

const DATA_PROVIDER_ABI = [
  "function getAllReservesTokens() view returns ((string symbol,address tokenAddress)[])",
  "function getUserReserveData(address asset,address user) view returns (uint256 currentATokenBalance,uint256 currentStableDebt,uint256 currentVariableDebt,uint256 principalStableDebt,uint256 scaledVariableDebt,uint256 stableBorrowRate,uint256 liquidityRate,uint40 stableRateLastUpdated,bool usageAsCollateralEnabled)",
  "function getReserveTokensAddresses(address asset) view returns (address aTokenAddress,address stableDebtTokenAddress,address variableDebtTokenAddress)",
];

const ERC20_METADATA_ABI = [
  "function decimals() view returns (uint8)",
];

function readDeploymentFile(): DeploymentFile {
  const deploymentPath = path.resolve(
    process.cwd(),
    "deploy",
    "addresses.base-sepolia.json"
  );
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Missing deployment file: ${deploymentPath}`);
  }
  return JSON.parse(fs.readFileSync(deploymentPath, "utf8")) as DeploymentFile;
}

function parseUserArg(): string | undefined {
  const idx = process.argv.findIndex((arg) => arg === "--user");
  if (idx >= 0 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  return process.env.USER_ADDR;
}

async function main(): Promise<void> {
  const deployment = readDeploymentFile();
  if (deployment.chainId !== 84532) {
    throw new Error(`Wrong deployment chainId ${deployment.chainId}`);
  }

  const [signer] = await ethers.getSigners();
  if (!signer) {
    throw new Error("No signer available.");
  }

  const requestedUser = parseUserArg();
  const user = requestedUser ? ethers.getAddress(requestedUser) : signer.address;

  const network = await ethers.provider.getNetwork();
  if (network.chainId !== 84532n) {
    throw new Error(`Wrong network chainId ${network.chainId}; expected 84532`);
  }

  const dataProvider = await ethers.getContractAt(
    DATA_PROVIDER_ABI,
    ethers.getAddress(deployment.config.dataProvider)
  );

  const reserves = (await dataProvider.getAllReservesTokens()) as ReserveToken[];

  console.log(`User: ${user}`);
  console.log(`DataProvider: ${deployment.config.dataProvider}`);

  let found = false;
  for (const reserve of reserves) {
    const data = (await dataProvider.getUserReserveData(
      reserve.tokenAddress,
      user
    )) as UserReserveData;

    if (
      data.currentATokenBalance === 0n &&
      data.currentStableDebt === 0n &&
      data.currentVariableDebt === 0n
    ) {
      continue;
    }

    found = true;
    const token = await ethers.getContractAt(ERC20_METADATA_ABI, reserve.tokenAddress);
    const decimals = await token
      .decimals()
      .then((v: number) => Number(v))
      .catch(() => 18);
    const reserveTokens = (await dataProvider.getReserveTokensAddresses(
      reserve.tokenAddress
    )) as { aTokenAddress: string };

    console.log(`${reserve.symbol} (${reserve.tokenAddress})`);
    console.log(`  supply: ${ethers.formatUnits(data.currentATokenBalance, decimals)}`);
    console.log(`  stableDebt: ${ethers.formatUnits(data.currentStableDebt, decimals)}`);
    console.log(`  variableDebt: ${ethers.formatUnits(data.currentVariableDebt, decimals)}`);
    console.log(`  aToken: ${reserveTokens.aTokenAddress}`);
  }

  if (!found) {
    console.log("No non-zero Aave reserves for this wallet.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

