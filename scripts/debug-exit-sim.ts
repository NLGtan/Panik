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
  config: {
    usdc: string;
  };
};

const SELECTOR_HINTS: Record<string, string> = {
  "0x39d35496": "V3TooLittleReceived()",
  "0x5bf6f916": "TransactionDeadlinePassed()",
  "0x3f4ab80e": "TRANSFER_FAILED()",
  "0xfb8f41b2": "ERC20InsufficientAllowance(address,uint256,uint256)",
};

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

function extractRevertData(error: unknown): string | null {
  const e = error as {
    data?: string;
    error?: { data?: string };
    info?: { error?: { data?: string } };
    shortMessage?: string;
    message?: string;
  };
  return e?.data ?? e?.error?.data ?? e?.info?.error?.data ?? null;
}

function getSelector(data: string | null): string | null {
  if (!data || data.length < 10) return null;
  return data.slice(0, 10).toLowerCase();
}

async function main(): Promise<void> {
  const deployment = readDeploymentFile();
  if (deployment.chainId !== 84532) {
    throw new Error(`Wrong chainId ${deployment.chainId}; expected 84532.`);
  }

  const [signer] = await ethers.getSigners();
  if (!signer) throw new Error("No signer available.");

  const network = await ethers.provider.getNetwork();
  if (network.chainId !== 84532n) {
    throw new Error(`Wrong network chainId ${network.chainId}; expected 84532.`);
  }

  const executor = deployment.addresses.panikExecutor;
  const abiPath = path.resolve(process.cwd(), "abi", "PanikExecutor.json");
  const abi = JSON.parse(fs.readFileSync(abiPath, "utf8"));
  const panik = new ethers.Contract(executor, abi, signer);

  const usdc = ethers.getAddress(deployment.config.usdc);
  const usdt = ethers.getAddress("0x0a215D8ba66387DCA84B284D18c3B4ec3de6E54a");
  const weth = ethers.getAddress("0x4200000000000000000000000000000000000006");
  const cbeth = ethers.getAddress("0xD171b9694f7A2597Ed006D41f7509aaD4B485c4B");
  const link = ethers.getAddress("0x810D46F9a9027E28F9B01F75E2bdde839dA61115");

  const cases: Array<{ label: string; assets: string[] }> = [
    { label: "USDC only", assets: [usdc] },
    { label: "USDT only", assets: [usdt] },
    { label: "WETH only", assets: [weth] },
    { label: "cbETH only", assets: [cbeth] },
    { label: "USDT + WETH", assets: [usdt, weth] },
    { label: "WETH + cbETH", assets: [weth, cbeth] },
    { label: "USDT + cbETH", assets: [usdt, cbeth] },
    { label: "LINK only", assets: [link] },
    { label: "All 5", assets: [usdc, usdt, weth, cbeth, link] },
    { label: "User case", assets: [usdt, weth, cbeth, link] },
  ];

  console.log(`Signer: ${signer.address}`);
  console.log(`Executor: ${executor}`);
  console.log(`USDC out: ${deployment.config.usdc}`);

  for (const testCase of cases) {
    try {
      await panik.atomicExit.staticCall(testCase.assets, []);
      console.log(`[OK] ${testCase.label}`);
    } catch (error) {
      const data = extractRevertData(error);
      const selector = getSelector(data);
      const hint = selector ? SELECTOR_HINTS[selector] : undefined;
      const shortMessage = (error as { shortMessage?: string }).shortMessage;
      console.log(`[FAIL] ${testCase.label}`);
      console.log(`  selector: ${selector ?? "n/a"}`);
      console.log(`  decoded : ${hint ?? "unknown"}`);
      if (shortMessage) {
        console.log(`  msg     : ${shortMessage}`);
      }
      if (!selector) {
        console.log(`  raw     :`, error);
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
