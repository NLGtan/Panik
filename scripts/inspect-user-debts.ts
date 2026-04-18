import { config as loadEnv } from "dotenv";
import { ethers } from "hardhat";
import fs from "node:fs";
import path from "node:path";

loadEnv();

type DeploymentFile = {
  chainId: number;
  config: {
    usdc: string;
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

type DebtRow = {
  asset: string;
  symbol: string;
  decimals: number;
  variableDebt: bigint;
  stableDebt: bigint;
  walletBalance: bigint;
};

const DATA_PROVIDER_ABI = [
  "function getAllReservesTokens() view returns ((string symbol,address tokenAddress)[])",
  "function getUserReserveData(address asset,address user) view returns (uint256 currentATokenBalance,uint256 currentStableDebt,uint256 currentVariableDebt,uint256 principalStableDebt,uint256 scaledVariableDebt,uint256 stableBorrowRate,uint256 liquidityRate,uint40 stableRateLastUpdated,bool usageAsCollateralEnabled)",
];

const ERC20_METADATA_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address account) view returns (uint256)",
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

function formatUnits(value: bigint, decimals: number): string {
  return ethers.formatUnits(value, decimals);
}

function sortVariableDebt(rows: DebtRow[], usdc: string): DebtRow[] {
  return [...rows].sort((a, b) => {
    const aIsUsdc = a.asset.toLowerCase() === usdc.toLowerCase();
    const bIsUsdc = b.asset.toLowerCase() === usdc.toLowerCase();
    if (aIsUsdc && !bIsUsdc) return -1;
    if (!aIsUsdc && bIsUsdc) return 1;
    return a.symbol.localeCompare(b.symbol);
  });
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
  const usdc = ethers.getAddress(deployment.config.usdc);
  const dataProviderAddress = ethers.getAddress(deployment.config.dataProvider);

  const network = await ethers.provider.getNetwork();
  if (network.chainId !== 84532n) {
    throw new Error(`Wrong network chainId ${network.chainId}; expected 84532`);
  }

  const dataProvider = await ethers.getContractAt(
    DATA_PROVIDER_ABI,
    dataProviderAddress
  );

  const reserves = (await dataProvider.getAllReservesTokens()) as ReserveToken[];
  const debts: DebtRow[] = [];

  for (const reserve of reserves) {
    const asset = ethers.getAddress(reserve.tokenAddress);
    const userReserveData = (await dataProvider.getUserReserveData(
      asset,
      user
    )) as UserReserveData;

    if (
      userReserveData.currentVariableDebt === 0n &&
      userReserveData.currentStableDebt === 0n
    ) {
      continue;
    }

    const token = await ethers.getContractAt(ERC20_METADATA_ABI, asset);
    const [symbol, decimals, walletBalance] = await Promise.all([
      token
        .symbol()
        .then((value: string) => value)
        .catch(() => reserve.symbol),
      token
        .decimals()
        .then((value: number) => Number(value))
        .catch(() => 18),
      token.balanceOf(user).then((value: bigint) => value),
    ]);

    debts.push({
      asset,
      symbol,
      decimals,
      variableDebt: userReserveData.currentVariableDebt,
      stableDebt: userReserveData.currentStableDebt,
      walletBalance,
    });
  }

  console.log(`User: ${user}`);
  console.log(`Aave Data Provider: ${dataProviderAddress}`);
  console.log(`USDC priority asset: ${usdc}`);

  if (debts.length === 0) {
    console.log("No open debt found for this wallet.");
    return;
  }

  const variableRows = sortVariableDebt(
    debts.filter((row) => row.variableDebt > 0n),
    usdc
  );
  const stableRows = debts
    .filter((row) => row.stableDebt > 0n)
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  console.log("");
  console.log("PANIK repay order:");
  console.log("1) Variable debt, USDC first");
  console.log("2) Remaining variable debt");
  console.log("3) Stable debt");
  console.log("");

  if (variableRows.length > 0) {
    console.log("Variable debt:");
    for (const row of variableRows) {
      const shortage =
        row.variableDebt > row.walletBalance
          ? row.variableDebt - row.walletBalance
          : 0n;
      console.log(
        `- ${row.symbol} (${row.asset}) | debt=${formatUnits(row.variableDebt, row.decimals)} | wallet=${formatUnits(row.walletBalance, row.decimals)} | shortfall=${formatUnits(shortage, row.decimals)}`
      );
    }
  } else {
    console.log("Variable debt: none");
  }

  console.log("");

  if (stableRows.length > 0) {
    console.log("Stable debt:");
    for (const row of stableRows) {
      const shortage =
        row.stableDebt > row.walletBalance ? row.stableDebt - row.walletBalance : 0n;
      console.log(
        `- ${row.symbol} (${row.asset}) | debt=${formatUnits(row.stableDebt, row.decimals)} | wallet=${formatUnits(row.walletBalance, row.decimals)} | shortfall=${formatUnits(shortage, row.decimals)}`
      );
    }
  } else {
    console.log("Stable debt: none");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

