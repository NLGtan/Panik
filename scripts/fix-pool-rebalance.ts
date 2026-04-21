import { config as loadEnv } from "dotenv";
import { ethers } from "hardhat";

loadEnv();

const UNIVERSAL_ROUTER = "0x492E6456D9528771018DeB9E87ef7750EF184104";
const NPM = "0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2";
const FACTORY = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";

const USDT = "0x0a215D8ba66387DCA84B284D18c3B4ec3de6E54a";
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const USDC_ALT = "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f";
const POOL_FEE = 500;

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function transfer(address to, uint256 value) returns (bool)",
];

const ROUTER_ABI = [
  "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable",
];

const FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)",
];

const POOL_ABI = [
  "function liquidity() view returns (uint128)",
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
];

const NPM_ABI = [
  "function createAndInitializePoolIfNecessary(address tokenA,address tokenB,uint24 fee,uint160 sqrtPriceX96) payable returns (address pool)",
  "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline) params) payable returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)",
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

async function printPoolState(poolAddress: string) {
  const pool = await ethers.getContractAt(POOL_ABI, poolAddress);
  const t0Addr = await pool.token0();
  const t1Addr = await pool.token1();
  const slot0 = await pool.slot0();
  const liq = await pool.liquidity();
  const t0 = await ethers.getContractAt(ERC20_ABI, t0Addr);
  const t1 = await ethers.getContractAt(ERC20_ABI, t1Addr);
  const [s0, d0, b0, s1, d1, b1] = await Promise.all([
    t0.symbol(), t0.decimals(), t0.balanceOf(poolAddress),
    t1.symbol(), t1.decimals(), t1.balanceOf(poolAddress),
  ]);
  console.log(`  Pool: ${poolAddress}`);
  console.log(`  Tick: ${slot0[1]}, Liquidity: ${liq}`);
  console.log(`  ${s0}: ${ethers.formatUnits(b0, d0)}`);
  console.log(`  ${s1}: ${ethers.formatUnits(b1, d1)}`);
  return { tick: Number(slot0[1]), liq, t0Addr, t1Addr };
}

async function swapViaRouter(
  signer: any,
  tokenIn: string,
  tokenOut: string,
  fee: number,
  amountIn: bigint,
  recipient: string
) {
  const router = await ethers.getContractAt(ROUTER_ABI, UNIVERSAL_ROUTER);
  const tokenInContract = await ethers.getContractAt(ERC20_ABI, tokenIn);

  // Transfer tokenIn to the router (payerIsUser=false pattern)
  const transferTx = await tokenInContract.transfer(UNIVERSAL_ROUTER, amountIn, { gasLimit: 100_000 });
  await transferTx.wait();
  console.log(`  Transferred ${ethers.formatUnits(amountIn, 6)} to router`);

  // Build V3_SWAP_EXACT_IN path: tokenIn + fee + tokenOut
  const feeHex = fee.toString(16).padStart(6, "0");
  const path = tokenIn.toLowerCase() + feeHex + tokenOut.toLowerCase().slice(2);

  // Encode input for V3_SWAP_EXACT_IN (command 0x00)
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const input = abiCoder.encode(
    ["address", "uint256", "uint256", "bytes", "bool"],
    [recipient, amountIn, 0, path, false] // payerIsUser=false
  );

  const commands = "0x00"; // V3_SWAP_EXACT_IN
  const deadline = Math.floor(Date.now() / 1000) + 600;

  const executeTx = await router.execute(commands, [input], deadline, { gasLimit: 500_000 });
  const receipt = await executeTx.wait();
  console.log(`  Swap tx: ${receipt?.hash ?? executeTx.hash}`);
}

async function addLiquidity(
  signer: any,
  tokenA: string,
  tokenB: string,
  fee: number,
  amountA: bigint,
  amountB: bigint
) {
  const npm = await ethers.getContractAt(NPM_ABI, NPM);
  const [token0, token1] = sortTokens(tokenA, tokenB);
  const isAToken0 = token0.toLowerCase() === tokenA.toLowerCase();
  const amount0 = isAToken0 ? amountA : amountB;
  const amount1 = isAToken0 ? amountB : amountA;

  // Ensure allowances
  for (const [addr, amt] of [[token0, amount0], [token1, amount1]] as [string, bigint][]) {
    const tk = await ethers.getContractAt(ERC20_ABI, addr);
    const allowance = (await tk.allowance(signer.address, NPM)) as bigint;
    if (allowance < amt) {
      const approveTx = await tk.approve(NPM, amt, { gasLimit: 100_000 });
      await approveTx.wait();
    }
  }

  const deadline = Math.floor(Date.now() / 1000) + 1200;
  const mintTx = await npm.mint({
    token0,
    token1,
    fee,
    tickLower: -887270,
    tickUpper: 887270,
    amount0Desired: amount0,
    amount1Desired: amount1,
    amount0Min: 0,
    amount1Min: 0,
    recipient: signer.address,
    deadline,
  }, { gasLimit: 1_000_000 });
  const receipt = await mintTx.wait();
  console.log(`  ✅ Liquidity added. tx: ${receipt?.hash ?? mintTx.hash}`);
}

async function main() {
  const [signer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== 84532n) throw new Error("Wrong chain");
  console.log(`Deployer: ${signer.address}`);

  const factory = await ethers.getContractAt(FACTORY_ABI, FACTORY);

  // ============================
  // FIX 1: USDT/USDC pool (fee 500)
  // ============================
  console.log("\n=== FIX USDT/USDC Pool (fee=500) ===");
  const poolAddr = await factory.getPool(USDT, USDC, POOL_FEE);
  if (poolAddr === ethers.ZeroAddress) {
    console.log("Pool doesn't exist! Creating...");
  }
  
  console.log("Before fix:");
  const before = await printPoolState(poolAddr);
  
  // The pool has ~155 USDT at a 14687:1 skewed price.
  // At this price, even 0.01 USDC buys ~146 USDT — enough to drain the pool.
  // We need a tiny swap just to move the tick, then add real liquidity.
  console.log("\nStep 1: Swapping 0.005 USDC → USDT to rebalance price...");
  const swapAmount = ethers.parseUnits("0.005", 6); // 0.005 USDC — tiny
  await swapViaRouter(signer, USDC, USDT, POOL_FEE, swapAmount, signer.address);
  
  console.log("\nAfter swap:");
  await printPoolState(poolAddr);

  // Step 2: Add balanced liquidity (50 USDT + 50 USDC)
  console.log("\nStep 2: Adding balanced liquidity (50+50)...");
  const seedAmount = ethers.parseUnits("50", 6);
  await addLiquidity(signer, USDT, USDC, POOL_FEE, seedAmount, seedAmount);
  
  console.log("\nAfter adding liquidity:");
  await printPoolState(poolAddr);

  // ============================
  // FIX 2: USDC_ALT/USDC pool (fee 500) — same approach
  // ============================
  console.log("\n\n=== FIX USDC_ALT/USDC Pool (fee=500) ===");
  const altPoolAddr = await factory.getPool(USDC_ALT, USDC, POOL_FEE);
  if (altPoolAddr !== ethers.ZeroAddress) {
    console.log("Before fix:");
    const altBefore = await printPoolState(altPoolAddr);
    
    if (Math.abs(altBefore.tick) > 100) {
      // Pool is imbalanced too
      console.log("\nPool is imbalanced, swapping to fix...");
      // Determine direction: if tick > 0, token0 is expensive -> sell token0
      // USDC_ALT vs USDC sorted: 0x036C < 0xba50, so token0=USDC, token1=USDC_ALT
      if (altBefore.tick > 0) {
        // token0 (USDC) is expensive, swap USDC → USDC_ALT
        const swapAmt = ethers.parseUnits("20", 6);
        await swapViaRouter(signer, USDC, USDC_ALT, POOL_FEE, swapAmt, signer.address);
      } else {
        // token1 (USDC_ALT) is expensive, swap USDC_ALT → USDC  
        const swapAmt = ethers.parseUnits("20", 6);
        await swapViaRouter(signer, USDC_ALT, USDC, POOL_FEE, swapAmt, signer.address);
      }
      console.log("\nAfter swap:");
      await printPoolState(altPoolAddr);
    }
    
    // Add balanced liquidity
    console.log("\nAdding balanced liquidity...");
    const altSeed = ethers.parseUnits("20", 6);
    await addLiquidity(signer, USDC_ALT, USDC, POOL_FEE, altSeed, altSeed);
    
    console.log("\nAfter adding liquidity:");
    await printPoolState(altPoolAddr);
  } else {
    console.log("Pool doesn't exist. Creating at 1:1...");
    const npm = await ethers.getContractAt(NPM_ABI, NPM);
    const [t0, t1] = sortTokens(USDC_ALT, USDC);
    const sqrtPrice = encodeSqrtRatioX96(1n * 10n**6n, 1n * 10n**6n); // 1:1 for same decimals
    const createTx = await npm.createAndInitializePoolIfNecessary(t0, t1, POOL_FEE, sqrtPrice, { gasLimit: 1_000_000 });
    await createTx.wait();
    
    const altSeed = ethers.parseUnits("20", 6);
    await addLiquidity(signer, USDC_ALT, USDC, POOL_FEE, altSeed, altSeed);
  }

  // ============================
  // TEST: atomicExit staticCall
  // ============================
  console.log("\n\n=== Testing atomicExit ===");
  const dep = await import("../deploy/addresses.base-sepolia.json");
  const abi = await import("../abi/PanikExecutor.json");
  const panik = new ethers.Contract(dep.addresses.panikExecutor, abi.default ?? abi, signer);

  for (const [label, asset] of [["USDT", USDT], ["USDC_ALT", USDC_ALT]] as const) {
    try {
      await panik.atomicExit.staticCall([asset], []);
      console.log(`✅ atomicExit([${label}], []) SUCCEEDED`);
    } catch (error: any) {
      const data = error?.data ?? error?.error?.data ?? error?.info?.error?.data ?? null;
      const selector = typeof data === "string" && data.length >= 10 ? data.slice(0, 10).toLowerCase() : "n/a";
      console.log(`❌ atomicExit([${label}], []) FAILED — selector: ${selector}`);
      console.log(`   ${error?.shortMessage ?? error?.message?.slice(0, 150) ?? "n/a"}`);
    }
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
