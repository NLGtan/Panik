import { config as loadEnv } from "dotenv";
import { ethers } from "hardhat";
import fs from "node:fs";
import path from "node:path";

loadEnv();

async function main() {
  const dep = JSON.parse(fs.readFileSync(path.resolve("deploy/addresses.base-sepolia.json"), "utf8"));
  const abi = JSON.parse(fs.readFileSync(path.resolve("abi/PanikExecutor.json"), "utf8"));
  const [signer] = await ethers.getSigners();
  const panik = new ethers.Contract(dep.addresses.panikExecutor, abi, signer);

  const usdt = "0x0a215D8ba66387DCA84B284D18c3B4ec3de6E54a";
  const swapConfig = await panik.getSwapConfig(usdt);
  console.log("swapConfig.usdt.enabled:", swapConfig.enabled);
  console.log("swapConfig.usdt.minOutBps:", swapConfig.minOutBps.toString());
  console.log("swapConfig.usdt.path:", swapConfig.path);

  try {
    await panik.atomicExit.staticCall([usdt], []);
    console.log("atomicExit USDT staticCall: OK");
  } catch (error: any) {
    const data = error?.data ?? error?.error?.data ?? error?.info?.error?.data ?? null;
    const selector = typeof data === "string" && data.length >= 10 ? data.slice(0,10).toLowerCase() : "n/a";
    console.log("atomicExit USDT staticCall: FAIL");
    console.log("selector:", selector);
    console.log("shortMessage:", error?.shortMessage ?? "n/a");
    try {
      const parsed = panik.interface.parseError(data);
      console.log("decoded:", parsed ? `${parsed.name}(${parsed.args.map((a:any)=>String(a)).join(",")})` : "unknown");
    } catch {
      console.log("decoded: unknown");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
