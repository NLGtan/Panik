import { config as loadEnv } from "dotenv";
import { ethers } from "hardhat";

loadEnv();

const BASE_SEPOLIA_CHAIN_ID = 84532n;
const FACTORY = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";
const NPM = "0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2";

const USDT = "0x0a215D8ba66387DCA84B284D18c3B4ec3de6E54a";
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const FEE = 500;

// We also need to seed the other swap routes that the executor uses.
// All swap paths route directly to USDC (0x036C...).
const WETH = "0x4200000000000000000000000000000000000006";
const LINK = "0x810D46F9a9027E28F9B01F75E2bdde839dA61115";
const cbETH = "0xD171b9694f7A2597Ed006D41f7509aaD4B485c4B";
const USDC_ALT = "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f"; // The "other" USDC in appConfig

const FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)",
];

const NPM_ABI = [
  "function factory() view returns (address)",
  "function createAndInitializePoolIfNecessary(address tokenA,address tokenB,uint24 fee,uint160 sqrtPriceX96) payable returns (address pool)",
  "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline) params) payable returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)",
];

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
];

const POOL_ABI = [
  "function liquidity() view returns (uint128)",
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
];

function sortTokens(a: string, b: string): [string, string] {
  return a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
}

function sqrt(value: bigint): bigint {
  if (value < 2n) return value;
  let x0 = value;
  let x1 = (x0 + value / x0) >> 1n;
  while (x1 < x0) {
    x0 = x1;
    x1 = (x0 + value / x0) >> 1n;
  }
  return x0;
}

function encodeSqrtRatioX96(amount1: bigint, amount0: bigint): bigint {
  const ratioX192 = (amount1 << 192n) / amount0;
  return sqrt(ratioX192);
}

async function ensureAllowance(tokenAddress: string, owner: string, spender: string, required: bigint) {
  const token = await ethers.getContractAt(ERC20_ABI, tokenAddress);
  const allowance = (await token.allowance(owner, spender)) as bigint;
  if (allowance >= required) return;
  const tx = await token.approve(spender, required, { gasLimit: 100_000 });
  await tx.wait();
  console.log(`  Approved ${tokenAddress} → ${spender}`);
}

type PoolSeed = {
  label: string;
  tokenA: string;
  tokenB: string;
  fee: number;
  amountA: string; // human-readable
  amountB: string;
  decimalsA: number;
  decimalsB: number;
  // price = amountB_per_amountA (for sqrtPriceX96 initialization)
  priceNum: bigint;
  priceDen: bigint;
};

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No signer available.");

  const network = await ethers.provider.getNetwork();
  if (network.chainId !== BASE_SEPOLIA_CHAIN_ID) {
    throw new Error(`Wrong chain ${network.chainId}. Expected ${BASE_SEPOLIA_CHAIN_ID}.`);
  }

  console.log(`Deployer: ${deployer.address}`);

  const factory = await ethers.getContractAt(FACTORY_ABI, FACTORY);
  const npm = await ethers.getContractAt(NPM_ABI, NPM);

  // Define pools to seed — focusing on USDT/USDC and USDC_ALT/USDC
  // These are the pools that the swap paths route through
  const pools: PoolSeed[] = [
    {
      label: "USDT/USDC (fee 500)",
      tokenA: USDT,
      tokenB: USDC,
      fee: 500,
      amountA: "100",  // 100 USDT
      amountB: "100",  // 100 USDC
      decimalsA: 6,
      decimalsB: 6,
      priceNum: 1n,
      priceDen: 1n,
    },
    {
      label: "USDC_ALT/USDC (fee 500)",
      tokenA: USDC_ALT,
      tokenB: USDC,
      fee: 500,
      amountA: "20",
      amountB: "20",
      decimalsA: 6,
      decimalsB: 6,
      priceNum: 1n,
      priceDen: 1n,
    },
  ];

  for (const poolConfig of pools) {
    console.log(`\n--- Seeding ${poolConfig.label} ---`);

    const tokenA = await ethers.getContractAt(ERC20_ABI, poolConfig.tokenA);
    const tokenB = await ethers.getContractAt(ERC20_ABI, poolConfig.tokenB);
    const [symA, symB] = await Promise.all([tokenA.symbol(), tokenB.symbol()]);
    const balA = (await tokenA.balanceOf(deployer.address)) as bigint;
    const balB = (await tokenB.balanceOf(deployer.address)) as bigint;

    const amountA = ethers.parseUnits(poolConfig.amountA, poolConfig.decimalsA);
    const amountB = ethers.parseUnits(poolConfig.amountB, poolConfig.decimalsB);

    console.log(`  ${symA} balance: ${ethers.formatUnits(balA, poolConfig.decimalsA)}`);
    console.log(`  ${symB} balance: ${ethers.formatUnits(balB, poolConfig.decimalsB)}`);
    console.log(`  Need: ${poolConfig.amountA} ${symA} + ${poolConfig.amountB} ${symB}`);

    if (balA < amountA) {
      console.log(`  ⚠️  Insufficient ${symA}. Skipping.`);
      continue;
    }
    if (balB < amountB) {
      console.log(`  ⚠️  Insufficient ${symB}. Skipping.`);
      continue;
    }

    // Approve
    await ensureAllowance(poolConfig.tokenA, deployer.address, NPM, amountA);
    await ensureAllowance(poolConfig.tokenB, deployer.address, NPM, amountB);

    // Sort tokens
    const [token0, token1] = sortTokens(poolConfig.tokenA, poolConfig.tokenB);
    const isAToken0 = token0.toLowerCase() === poolConfig.tokenA.toLowerCase();
    const amount0 = isAToken0 ? amountA : amountB;
    const amount1 = isAToken0 ? amountB : amountA;

    // Compute sqrtPriceX96 for 1:1 price (adjusted for decimals)
    const dec0 = isAToken0 ? poolConfig.decimalsA : poolConfig.decimalsB;
    const dec1 = isAToken0 ? poolConfig.decimalsB : poolConfig.decimalsA;
    const priceNum = isAToken0 ? poolConfig.priceNum : poolConfig.priceDen;
    const priceDen = isAToken0 ? poolConfig.priceDen : poolConfig.priceNum;
    
    const rawAmount1 = priceNum * (10n ** BigInt(dec1));
    const rawAmount0 = priceDen * (10n ** BigInt(dec0));
    const sqrtPriceX96 = encodeSqrtRatioX96(rawAmount1, rawAmount0);

    // Check if pool exists
    let poolAddress = await factory.getPool(token0, token1, poolConfig.fee);
    if (poolAddress === ethers.ZeroAddress) {
      console.log("  Creating pool...");
      const createTx = await npm.createAndInitializePoolIfNecessary(
        token0, token1, poolConfig.fee, sqrtPriceX96, { gasLimit: 1_000_000 }
      );
      await createTx.wait();
      poolAddress = await factory.getPool(token0, token1, poolConfig.fee);
      console.log(`  Pool created: ${poolAddress}`);
    } else {
      console.log(`  Pool exists: ${poolAddress}`);
    }

    // Add liquidity with full-range ticks
    const deadline = Math.floor(Date.now() / 1000) + 1200;
    console.log(`  Adding liquidity: ${ethers.formatUnits(amount0, dec0)} token0 + ${ethers.formatUnits(amount1, dec1)} token1`);
    
    const mintTx = await npm.mint({
      token0,
      token1,
      fee: poolConfig.fee,
      tickLower: -887270,
      tickUpper: 887270,
      amount0Desired: amount0,
      amount1Desired: amount1,
      amount0Min: 0,
      amount1Min: 0,
      recipient: deployer.address,
      deadline,
    }, { gasLimit: 1_000_000 });
    const receipt = await mintTx.wait();
    console.log(`  ✅ Liquidity added. tx: ${receipt?.hash ?? mintTx.hash}`);

    // Verify pool state after
    try {
      const pool = await ethers.getContractAt(POOL_ABI, poolAddress);
      const liq = await pool.liquidity();
      const t0 = await ethers.getContractAt(ERC20_ABI, token0);
      const t1 = await ethers.getContractAt(ERC20_ABI, token1);
      const [b0, b1] = await Promise.all([t0.balanceOf(poolAddress), t1.balanceOf(poolAddress)]);
      console.log(`  Pool liquidity: ${liq}`);
      console.log(`  Pool token0: ${ethers.formatUnits(b0, dec0)}`);
      console.log(`  Pool token1: ${ethers.formatUnits(b1, dec1)}`);
    } catch {
      // ignore
    }
  }

  // Now test the exit
  console.log("\n\n=== Testing atomicExit staticCall ===");
  const dep = await import("../deploy/addresses.base-sepolia.json");
  const abi = await import("../abi/PanikExecutor.json");
  const panik = new ethers.Contract(dep.addresses.panikExecutor, abi.default ?? abi, deployer);

  try {
    await panik.atomicExit.staticCall([USDT], []);
    console.log("✅ atomicExit([USDT], []) staticCall SUCCEEDED!");
  } catch (error: any) {
    const data = error?.data ?? error?.error?.data ?? error?.info?.error?.data ?? null;
    const selector = typeof data === "string" && data.length >= 10 ? data.slice(0, 10).toLowerCase() : "n/a";
    console.log(`❌ atomicExit([USDT], []) still fails`);
    console.log(`   selector: ${selector}`);
    console.log(`   message: ${error?.shortMessage ?? error?.message?.slice(0, 200) ?? "n/a"}`);
    if (typeof data === "string") {
      try {
        const parsed = panik.interface.parseError(data);
        if (parsed) {
          console.log(`   decoded: ${parsed.name}(${parsed.args.map((a: any) => String(a)).join(",")})`);
        }
      } catch {}
    }
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
