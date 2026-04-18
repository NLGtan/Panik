import { config as loadEnv } from "dotenv";
import { ethers } from "hardhat";
import fs from "node:fs";
import path from "node:path";
import util from "node:util";

loadEnv();

type DeploymentFile = {
  chainId: number;
  addresses: {
    panikExecutor: string;
  };
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

function collectCandidateData(error: unknown): string[] {
  const e = error as {
    data?: unknown;
    error?: unknown;
    info?: unknown;
    shortMessage?: unknown;
    message?: unknown;
  };

  const values: unknown[] = [e?.data, e?.error, e?.info, e?.shortMessage, e?.message];
  const out: string[] = [];

  for (const value of values) {
    if (typeof value === "string" && value.startsWith("0x")) {
      out.push(value);
      continue;
    }
    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      for (const nested of Object.values(obj)) {
        if (typeof nested === "string" && nested.startsWith("0x")) {
          out.push(nested);
        }
        if (nested && typeof nested === "object") {
          for (const deep of Object.values(nested as Record<string, unknown>)) {
            if (typeof deep === "string" && deep.startsWith("0x")) {
              out.push(deep);
            }
          }
        }
      }
    }
  }

  return Array.from(new Set(out));
}

async function main(): Promise<void> {
  const deployment = readDeploymentFile();
  if (deployment.chainId !== 84532) {
    throw new Error(`Wrong chainId ${deployment.chainId}; expected 84532.`);
  }

  const [signer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== 84532n) {
    throw new Error(`Wrong network chainId ${network.chainId}; expected 84532.`);
  }

  const abiPath = path.resolve(process.cwd(), "abi", "PanikExecutor.json");
  const abi = JSON.parse(fs.readFileSync(abiPath, "utf8"));
  const panik = new ethers.Contract(deployment.addresses.panikExecutor, abi, signer);

  const assets = [
    "0x0a215D8ba66387DCA84B284D18c3B4ec3de6E54a", // USDT
    "0x4200000000000000000000000000000000000006", // WETH
    "0xD171b9694f7A2597Ed006D41f7509aaD4B485c4B", // cbETH
    "0x810D46F9a9027E28F9B01F75E2bdde839dA61115", // LINK
  ];

  console.log(`Signer: ${signer.address}`);
  console.log(`Executor: ${deployment.addresses.panikExecutor}`);
  console.log(`Assets: ${assets.join(",")}`);

  try {
    await panik.atomicExit.staticCall(assets);
    console.log("atomicExit.staticCall succeeded");
  } catch (error) {
    console.log("atomicExit.staticCall reverted");
    console.log(util.inspect(error, { depth: 8, colors: false }));

    const candidates = collectCandidateData(error);
    if (candidates.length === 0) {
      console.log("No revert data candidates found.");
      return;
    }

    console.log("Revert data candidates:");
    for (const data of candidates) {
      const selector = data.length >= 10 ? data.slice(0, 10).toLowerCase() : "n/a";
      let decoded: string | null = null;
      try {
        const parsed = panik.interface.parseError(data);
        decoded = parsed ? `${parsed.name}(${parsed.args.map((a) => String(a)).join(",")})` : null;
      } catch {
        decoded = null;
      }
      console.log(`  data: ${data}`);
      console.log(`  selector: ${selector}`);
      console.log(`  decoded: ${decoded ?? "unknown"}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

