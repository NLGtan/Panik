import { config as loadEnv } from "dotenv";
import { ethers } from "hardhat";
import fs from "node:fs";
import path from "node:path";

loadEnv();

type DeploymentFile = {
  chainId: number;
  addresses: {
    panikExecutor: string;
  };
};

const CBETH = "0xD171b9694f7A2597Ed006D41f7509aaD4B485c4B";
const DATA_PROVIDER = "0xBc9f5b7E248451CdD7cA54e717a2BFe1F32b566b";

const DATA_PROVIDER_ABI = [
  "function getUserReserveData(address asset,address user) view returns (uint256 currentATokenBalance,uint256 currentStableDebt,uint256 currentVariableDebt,uint256 principalStableDebt,uint256 scaledVariableDebt,uint256 stableBorrowRate,uint256 liquidityRate,uint40 stableRateLastUpdated,bool usageAsCollateralEnabled)",
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

function selectorFromError(error: unknown): string | null {
  const e = error as { data?: string; error?: { data?: string } };
  const data = e?.data ?? e?.error?.data ?? "";
  if (typeof data === "string" && data.length >= 10) {
    return data.slice(0, 10).toLowerCase();
  }
  return null;
}

async function main(): Promise<void> {
  const deployment = readDeploymentFile();
  if (deployment.chainId !== 84532) {
    throw new Error(`Wrong chain id ${deployment.chainId}; expected 84532`);
  }

  const [signer] = await ethers.getSigners();
  if (!signer) throw new Error("No signer available.");

  const network = await ethers.provider.getNetwork();
  if (network.chainId !== 84532n) {
    throw new Error(`Wrong chain id ${network.chainId}; expected 84532`);
  }

  const abiPath = path.resolve(process.cwd(), "abi", "PanikExecutor.json");
  const panikAbi = JSON.parse(fs.readFileSync(abiPath, "utf8"));
  const panik = new ethers.Contract(
    deployment.addresses.panikExecutor,
    panikAbi,
    signer
  );

  const dataProvider = await ethers.getContractAt(DATA_PROVIDER_ABI, DATA_PROVIDER);
  const reserve = (await dataProvider.getUserReserveData(CBETH, signer.address)) as {
    currentATokenBalance: bigint;
  };
  const balance = reserve.currentATokenBalance;

  console.log(`Signer: ${signer.address}`);
  console.log(`Executor: ${deployment.addresses.panikExecutor}`);
  console.log(`cbETH supply: ${ethers.formatUnits(balance, 18)} (${balance.toString()} wei)`);

  if (balance === 0n) {
    console.log("No cbETH supplied; nothing to test.");
    return;
  }

  const candidates: bigint[] = [
    1n,
    10n,
    100n,
    1_000n,
    10_000n,
    100_000n,
    1_000_000n,
    10_000_000n,
    100_000_000n,
    1_000_000_000n,
    10_000_000_000n,
    100_000_000_000n,
    1_000_000_000_000n,
    10_000_000_000_000n,
    100_000_000_000_000n,
    1_000_000_000_000_000n, // 0.001
    balance / 10n,
    balance / 5n,
    balance / 2n,
    balance
  ].filter((v) => v > 0n && v <= balance);

  // de-duplicate while preserving order
  const seen = new Set<string>();
  const tests: bigint[] = [];
  for (const c of candidates) {
    const key = c.toString();
    if (!seen.has(key)) {
      seen.add(key);
      tests.push(c);
    }
  }

  let firstSuccess: bigint | null = null;
  for (const amount of tests) {
    try {
      await panik.partialExit.staticCall([CBETH], [amount]);
      console.log(`OK  amount=${amount.toString()} (${ethers.formatUnits(amount, 18)} cbETH)`);
      if (firstSuccess === null || amount < firstSuccess) {
        firstSuccess = amount;
      }
    } catch (error) {
      const selector = selectorFromError(error);
      console.log(
        `FAIL amount=${amount.toString()} (${ethers.formatUnits(amount, 18)} cbETH) selector=${selector ?? "n/a"}`
      );
    }
  }

  if (firstSuccess === null) {
    console.log("Result: no tested cbETH amount is currently exitable.");
  } else {
    console.log(
      `Result: minimum tested passing amount = ${firstSuccess.toString()} wei (${ethers.formatUnits(firstSuccess, 18)} cbETH).`
    );
  }

  // Find maximum exitable amount with binary search in [1, balance].
  let lo = 0n;
  let hi = balance + 1n; // exclusive
  while (lo + 1n < hi) {
    const mid = (lo + hi) / 2n;
    try {
      await panik.partialExit.staticCall([CBETH], [mid]);
      lo = mid; // mid passes; move up
    } catch {
      hi = mid; // mid fails; move down
    }
  }

  const maxPassing = lo;
  if (maxPassing == 0n) {
    console.log("Binary-search result: no exitable cbETH amount found.");
  } else {
    console.log(
      `Binary-search result: maximum passing amount = ${maxPassing.toString()} wei (${ethers.formatUnits(maxPassing, 18)} cbETH).`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
