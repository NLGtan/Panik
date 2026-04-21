import { config as loadEnv } from "dotenv";
import { ethers } from "hardhat";

loadEnv();

const FACTORY = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";
const USDT = "0x0a215D8ba66387DCA84B284D18c3B4ec3de6E54a";
const OFFICIAL_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const AAVE_USDC = "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f";
const FEES = [500, 3000, 10000];

const FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)",
];
const POOL_ABI = [
  "function liquidity() view returns (uint128)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
];
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

async function describePool(
  tokenA: string,
  tokenB: string,
  fee: number,
  factory: any
) {
  const poolAddress = await factory.getPool(tokenA, tokenB, fee);
  if (poolAddress === ethers.ZeroAddress) {
    console.log(`fee=${fee} pool: NONE`);
    return;
  }

  const pool = await ethers.getContractAt(POOL_ABI, poolAddress);
  const [token0, token1, liquidity] = await Promise.all([
    pool.token0(),
    pool.token1(),
    pool.liquidity(),
  ]);

  const t0 = await ethers.getContractAt(ERC20_ABI, token0);
  const t1 = await ethers.getContractAt(ERC20_ABI, token1);
  const [s0, d0, b0, s1, d1, b1] = await Promise.all([
    t0.symbol(),
    t0.decimals(),
    t0.balanceOf(poolAddress),
    t1.symbol(),
    t1.decimals(),
    t1.balanceOf(poolAddress),
  ]);

  console.log(`fee=${fee} pool: ${poolAddress}`);
  console.log(`  liquidity=${liquidity.toString()}`);
  console.log(`  ${s0}=${ethers.formatUnits(b0, d0)} | ${s1}=${ethers.formatUnits(b1, d1)}`);
}

async function main() {
  const factory = await ethers.getContractAt(FACTORY_ABI, FACTORY);
  console.log("USDT -> official USDC");
  for (const fee of FEES) {
    await describePool(USDT, OFFICIAL_USDC, fee, factory);
  }

  console.log("\nUSDT -> Aave USDC");
  for (const fee of FEES) {
    await describePool(USDT, AAVE_USDC, fee, factory);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

