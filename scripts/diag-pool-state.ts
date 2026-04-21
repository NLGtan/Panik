import { config as loadEnv } from "dotenv";
import { ethers } from "hardhat";

loadEnv();

// Decode the revert selector 0x39d35496
// This is likely from the UniversalRouter or one of its internal modules.

const UNIVERSAL_ROUTER = "0x492E6456D9528771018DeB9E87ef7750EF184104";
const SWAP_ADAPTER = "0xD79688CD542a19536d075A51d46000A70d41b3C7";
const USDT = "0x0a215D8ba66387DCA84B284D18c3B4ec3de6E54a";
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const POOL = "0xAF53CAb0C0414A2e8C2f5a7eFab0A5a622944D7e";

// Known error selectors
const knownSelectors: Record<string, string> = {
  "0x39d35496": "InvalidSwap() — Uniswap V3 router revert: no liquidity path, or output is 0",
  "0xf4059071": "InsufficientOutputAmount()",
  "0x849eaf98": "V3InvalidSwap()",
  "0x3b99b53d": "SlippageCheckFailed(minAmount, receivedAmount)",
  "0xd4e0dcf0": "TooLittleReceived()",
};

const POOL_ABI = [
  "function liquidity() view returns (uint128)",
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)",
];

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

async function main() {
  console.log("=== Revert Selector Analysis ===\n");
  
  const selector = "0x39d35496";
  console.log(`Selector: ${selector}`);
  console.log(`Known: ${knownSelectors[selector] ?? "Unknown"}`);
  
  // Compute keccak of known error sigs
  const candidates = [
    "V3InvalidSwap()",
    "InvalidSwap()",
    "V3_INVALID_SWAP()",
    "InsufficientOutputAmount(uint256,uint256)",
    "InsufficientOutputAmount()",
    "TooLittleReceived(uint256,uint256)",
    "InvalidAmountOut()",
    "V3TooLittleReceived()",
  ];
  
  console.log("\nChecking error signature hashes:");
  for (const sig of candidates) {
    const hash = ethers.id(sig).slice(0, 10);
    console.log(`  ${sig} → ${hash} ${hash === selector ? "✅ MATCH" : ""}`);
  }
  
  // Check pool state in detail
  console.log("\n=== Pool State Analysis ===\n");
  const pool = await ethers.getContractAt(POOL_ABI, POOL);
  const t0 = await pool.token0();
  const t1 = await pool.token1();
  const liquidity = await pool.liquidity();
  const slot0 = await pool.slot0();
  const fee = await pool.fee();
  
  console.log(`Pool: ${POOL}`);
  console.log(`Token0: ${t0}`);
  console.log(`Token1: ${t1}`);
  console.log(`Fee: ${fee}`);
  console.log(`Liquidity: ${liquidity}`);
  console.log(`sqrtPriceX96: ${slot0[0]}`);
  console.log(`Tick: ${slot0[1]}`);
  
  const token0 = await ethers.getContractAt(ERC20_ABI, t0);
  const token1 = await ethers.getContractAt(ERC20_ABI, t1);
  const [sym0, dec0, bal0, sym1, dec1, bal1] = await Promise.all([
    token0.symbol(), token0.decimals(), token0.balanceOf(POOL),
    token1.symbol(), token1.decimals(), token1.balanceOf(POOL),
  ]);
  
  console.log(`\n${sym0} balance: ${ethers.formatUnits(bal0, dec0)} (${bal0} raw)`);
  console.log(`${sym1} balance: ${ethers.formatUnits(bal1, dec1)} (${bal1} raw)`);
  
  // Calculate implied price  
  const sqrtPrice = BigInt(slot0[0]);
  const Q96 = 1n << 96n;
  const priceX192 = sqrtPrice * sqrtPrice;
  const price0In1 = priceX192 / (Q96 * Q96);
  console.log(`\nImplied price (token1 per token0 in raw): ${price0In1}`);
  
  // For stablecoins with same decimals, this should be close to 1
  if (Number(dec0) === Number(dec1)) {
    const humanPrice = Number(priceX192) / Number(Q96 * Q96);
    console.log(`Human price: ${humanPrice.toFixed(6)}`);
  }
  
  // The key issue: if pool has almost no USDC, swapping USDT->USDC will fail
  // because there isn't enough USDC to give back
  console.log("\n=== Diagnosis ===");
  const usdcIsToken0 = t0.toLowerCase() === USDC.toLowerCase();
  const usdcBalance = usdcIsToken0 ? bal0 : bal1;
  const usdtBalance = usdcIsToken0 ? bal1 : bal0;
  console.log(`USDC in pool: ${ethers.formatUnits(usdcBalance, 6)}`);
  console.log(`USDT in pool: ${ethers.formatUnits(usdtBalance, 6)}`);
  
  if (usdcBalance < 1000n) { // less than 0.001 USDC
    console.log("\n⚠️  POOL HAS ALMOST NO USDC!");
    console.log("Any USDT→USDC swap will fail because there's nothing to receive.");
    console.log("The pool needs to be re-seeded with adequate USDC liquidity.");
  }
  
  // Check deployer balances
  const [signer] = await ethers.getSigners();
  const usdtBal = await token0.balanceOf(signer.address);
  const usdcBal = await token1.balanceOf(signer.address);
  console.log(`\nDeployer ${sym0}: ${ethers.formatUnits(usdtBal, dec0)}`);
  console.log(`Deployer ${sym1}: ${ethers.formatUnits(usdcBal, dec1)}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
