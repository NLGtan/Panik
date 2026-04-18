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
const EXACT_AMOUNT_WEI = 3_729_196_665_878n; // 0.000003729196665878 cbETH

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
  if (typeof data === "string" && data.length >= 10) return data.slice(0, 10);
  return null;
}

async function main(): Promise<void> {
  const deployment = readDeploymentFile();
  if (deployment.chainId !== 84532) {
    throw new Error(`Wrong chain id ${deployment.chainId}; expected 84532`);
  }

  const [signer] = await ethers.getSigners();
  if (!signer) throw new Error("No signer available.");

  const abiPath = path.resolve(process.cwd(), "abi", "PanikExecutor.json");
  const panikAbi = JSON.parse(fs.readFileSync(abiPath, "utf8"));
  const panik = new ethers.Contract(
    deployment.addresses.panikExecutor,
    panikAbi,
    signer
  );

  console.log(`Signer: ${signer.address}`);
  console.log(`Executor: ${deployment.addresses.panikExecutor}`);
  console.log(
    `Testing partialExit cbETH amount: ${EXACT_AMOUNT_WEI.toString()} wei (${ethers.formatUnits(EXACT_AMOUNT_WEI, 18)} cbETH)`
  );

  try {
    await panik.partialExit.staticCall([CBETH], [EXACT_AMOUNT_WEI]);
    console.log("Result: PASS (partialExit simulation succeeded).");
  } catch (error) {
    console.log(`Result: FAIL selector=${selectorFromError(error) ?? "n/a"}`);
    console.log(error);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

