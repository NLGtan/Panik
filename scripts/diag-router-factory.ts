import { config as loadEnv } from "dotenv";
import { ethers } from "hardhat";

loadEnv();

const UNIVERSAL_ROUTER = "0x492E6456D9528771018DeB9E87ef7750EF184104";
const SEED_FACTORY = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";
const SEED_NPM = "0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2";
const APP_NPM = "0x5b4f4e93d2754f23fa540609b1031f9715099179";

const USDT = "0x0a215D8ba66387DCA84B284D18c3B4ec3de6E54a";
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)",
];

const POOL_ABI = [
  "function liquidity() view returns (uint128)",
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
];

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

const NPM_ABI = [
  "function factory() view returns (address)",
];

// Try multiple selectors that different UniversalRouter versions might expose
const ROUTER_FACTORY_SELECTORS = [
  "function UNISWAP_V3_FACTORY() view returns (address)",
  "function factory() view returns (address)",
  "function factoryV2() view returns (address)",
];

async function tryReadFactory(routerAddress: string): Promise<string | null> {
  for (const sig of ROUTER_FACTORY_SELECTORS) {
    try {
      const router = await ethers.getContractAt([sig], routerAddress);
      const funcName = sig.split("(")[0].split(" ").pop()!;
      const result = await (router as any)[funcName]();
      return result as string;
    } catch {
      // selector not supported, try next
    }
  }
  return null;
}

async function checkPool(factoryAddr: string, label: string) {
  const factory = await ethers.getContractAt(FACTORY_ABI, factoryAddr);
  
  for (const fee of [100, 500, 3000, 10000]) {
    const poolAddr = await factory.getPool(USDT, USDC, fee);
    if (poolAddr !== ethers.ZeroAddress) {
      console.log(`  [${label}] USDT/USDC fee=${fee} pool=${poolAddr}`);
      try {
        const pool = await ethers.getContractAt(POOL_ABI, poolAddr);
        const liquidity = await pool.liquidity();
        console.log(`    liquidity: ${liquidity.toString()}`);
        
        const t0Addr = await pool.token0();
        const t1Addr = await pool.token1();
        const t0 = await ethers.getContractAt(ERC20_ABI, t0Addr);
        const t1 = await ethers.getContractAt(ERC20_ABI, t1Addr);
        const [s0, d0, b0, s1, d1, b1] = await Promise.all([
          t0.symbol(), t0.decimals(), t0.balanceOf(poolAddr),
          t1.symbol(), t1.decimals(), t1.balanceOf(poolAddr),
        ]);
        console.log(`    ${s0}: ${ethers.formatUnits(b0, d0)}`);
        console.log(`    ${s1}: ${ethers.formatUnits(b1, d1)}`);
      } catch (e: any) {
        console.log(`    (failed to read pool details: ${e.message?.slice(0, 80)})`);
      }
    } else {
      console.log(`  [${label}] USDT/USDC fee=${fee} → NO POOL`);
    }
  }
}

async function main() {
  console.log("=== Panik Router/Factory Diagnostic ===\n");

  // 1. Check what factory the seed NPM points to
  console.log("1) Seed NPM factory check:");
  try {
    const seedNpm = await ethers.getContractAt(NPM_ABI, SEED_NPM);
    const seedNpmFactory = await seedNpm.factory();
    console.log(`   Seed NPM (${SEED_NPM}) → factory: ${seedNpmFactory}`);
    console.log(`   Matches SEED_FACTORY (${SEED_FACTORY}): ${seedNpmFactory.toLowerCase() === SEED_FACTORY.toLowerCase()}`);
  } catch (e: any) {
    console.log(`   Failed: ${e.message?.slice(0, 100)}`);
  }

  // 2. Check what factory the app NPM points to
  console.log("\n2) App NPM factory check:");
  try {
    const appNpm = await ethers.getContractAt(NPM_ABI, APP_NPM);
    const appNpmFactory = await appNpm.factory();
    console.log(`   App NPM (${APP_NPM}) → factory: ${appNpmFactory}`);
    console.log(`   Matches SEED_FACTORY (${SEED_FACTORY}): ${appNpmFactory.toLowerCase() === SEED_FACTORY.toLowerCase()}`);
  } catch (e: any) {
    console.log(`   Failed: ${e.message?.slice(0, 100)}`);
  }

  // 3. Try to read factory from UniversalRouter
  console.log("\n3) UniversalRouter factory check:");
  const routerFactory = await tryReadFactory(UNIVERSAL_ROUTER);
  if (routerFactory) {
    console.log(`   UniversalRouter (${UNIVERSAL_ROUTER}) → factory: ${routerFactory}`);
    console.log(`   Matches SEED_FACTORY: ${routerFactory.toLowerCase() === SEED_FACTORY.toLowerCase()}`);
  } else {
    console.log("   Could not read factory from UniversalRouter (no matching selector).");
    console.log("   The router routes via its hardcoded internal factory reference.");
  }

  // 4. Check pools on the seed factory
  console.log("\n4) Pools on SEED_FACTORY:");
  await checkPool(SEED_FACTORY, "seed-factory");

  // 5. Read the UniversalRouter bytecode to find embedded factory
  console.log("\n5) UniversalRouter bytecode factory scan:");
  const code = await ethers.provider.getCode(UNIVERSAL_ROUTER);
  const seedFactoryLower = SEED_FACTORY.toLowerCase().replace("0x", "");
  if (code.toLowerCase().includes(seedFactoryLower)) {
    console.log(`   ✅ SEED_FACTORY (${SEED_FACTORY}) IS embedded in router bytecode`);
  } else {
    console.log(`   ❌ SEED_FACTORY (${SEED_FACTORY}) NOT found in router bytecode`);
    // Try to find any 20-byte address that looks like a factory
    console.log("   Searching for other potential factory addresses...");
  }

  // 6. Try a staticCall simulation of the swap through executor
  console.log("\n6) atomicExit staticCall simulation:");
  const dep = await import("../deploy/addresses.base-sepolia.json");
  const abi = await import("../abi/PanikExecutor.json");
  const [signer] = await ethers.getSigners();
  const panik = new ethers.Contract(dep.addresses.panikExecutor, abi.default ?? abi, signer);

  // First check swap config
  const swapConfig = await panik.getSwapConfig(USDT);
  console.log(`   USDT swap enabled: ${swapConfig.enabled}`);
  console.log(`   USDT swap path: ${swapConfig.path}`);
  console.log(`   USDT minOutBps: ${swapConfig.minOutBps}`);

  // Try staticCall
  try {
    await panik.atomicExit.staticCall([USDT], []);
    console.log("   ✅ atomicExit([USDT], []) staticCall SUCCEEDED");
  } catch (error: any) {
    const data = error?.data ?? error?.error?.data ?? error?.info?.error?.data ?? null;
    const selector = typeof data === "string" && data.length >= 10 ? data.slice(0, 10).toLowerCase() : "n/a";
    console.log(`   ❌ atomicExit([USDT], []) staticCall FAILED`);
    console.log(`   selector: ${selector}`);
    console.log(`   shortMessage: ${error?.shortMessage ?? error?.message?.slice(0, 150) ?? "n/a"}`);
    
    if (typeof data === "string") {
      try {
        const parsed = panik.interface.parseError(data);
        if (parsed) {
          console.log(`   decoded: ${parsed.name}(${parsed.args.map((a: any) => String(a)).join(",")})`);
        }
      } catch {
        console.log("   decoded: unknown");
      }
    }
  }

  console.log("\n=== Done ===");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
