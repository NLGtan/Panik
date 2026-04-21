import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();
  const weth = await ethers.getContractAt(
    ["function deposit() payable", "function balanceOf(address) view returns (uint256)"],
    "0x4200000000000000000000000000000000000006"
  );
  const amount = ethers.parseEther("0.01");
  console.log(`Wrapping 0.01 ETH → WETH...`);
  const tx = await weth.deposit({ value: amount, gasLimit: 100_000 });
  await tx.wait();
  const bal = await weth.balanceOf(signer.address);
  console.log(`✅ Done. WETH balance: ${ethers.formatEther(bal)}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
