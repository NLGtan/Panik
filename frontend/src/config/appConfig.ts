import { onchainConfig } from "./generated";
import type { AssetCandidate } from "../types";

export const appConfig = {
  chainId: onchainConfig.chainId,
  panikExecutor: onchainConfig.panikExecutor as `0x${string}`,
  lockChecker: onchainConfig.lockChecker as `0x${string}`,
  usdc: onchainConfig.usdc as `0x${string}`,
  nonfungiblePositionManager: "0x5b4f4e93d2754f23fa540609b1031f9715099179" as `0x${string}`,
  baseScanTx: "https://sepolia.basescan.org/tx/",
  hiddenAssets: [] as const,
  assets: [
    {
      address: "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f",
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
    },
    {
      address: "0x0a215D8ba66387DCA84B284D18c3B4ec3de6E54a",
      symbol: "USDT",
      name: "Tether USD",
      decimals: 6,
    },
    {
      address: "0x54114591963CF60EF3aA63bEfD6eC263D98145a4",
      symbol: "WBTC",
      name: "Wrapped BTC",
      decimals: 8,
    },
    {
      address: "0x4200000000000000000000000000000000000006",
      symbol: "WETH",
      name: "Wrapped Ether",
      decimals: 18,
    },
    {
      address: "0xD171b9694f7A2597Ed006D41f7509aaD4B485c4B",
      symbol: "cbETH",
      name: "Coinbase Wrapped Staked ETH",
      decimals: 18,
    },
    {
      address: "0x810D46F9a9027E28F9B01F75E2bdde839dA61115",
      symbol: "LINK",
      name: "ChainLink Token",
      decimals: 18,
    },
  ] satisfies AssetCandidate[],
} as const;
