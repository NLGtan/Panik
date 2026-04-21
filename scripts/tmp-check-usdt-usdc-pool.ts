import { config as loadEnv } from "dotenv";
import { ethers } from "hardhat";

loadEnv();

const FACTORY = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";
const USDT = "0x0a215D8ba66387DCA84B284D18c3B4ec3de6E54a";
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const FEE = 500;

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

async function main() {
  const factory = await ethers.getContractAt(FACTORY_ABI, FACTORY);
  const poolAddress = await factory.getPool(USDT, USDC, FEE);
  console.log("pool:", poolAddress);
  if (poolAddress === ethers.ZeroAddress) return;

  const pool = await ethers.getContractAt(POOL_ABI, poolAddress);
  const token0 = await pool.token0();
  const token1 = await pool.token1();
  const liquidity = await pool.liquidity();
  const slot0 = await pool.slot0();
  console.log("token0:", token0);
  console.log("token1:", token1);
  console.log("liquidity:", liquidity.toString());
  console.log("tick:", slot0[1].toString());

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
  console.log(`pool balance ${s0}:`, ethers.formatUnits(b0, d0));
  console.log(`pool balance ${s1}:`, ethers.formatUnits(b1, d1));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

