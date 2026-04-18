import type { Abi } from "viem";

export const panikExecutorAbi = [
  {
    type: "function",
    stateMutability: "view",
    name: "dataProvider",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "marketOracle",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "getTrackedAssets",
    inputs: [],
    outputs: [{ name: "", type: "address[]" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "getSwapConfig",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [
      { name: "enabled", type: "bool" },
      { name: "path", type: "bytes" },
      { name: "minOutBps", type: "uint16" },
      { name: "useMockOracle", type: "bool" },
    ],
  },
  {
    type: "function",
    stateMutability: "nonpayable",
    name: "atomicExit",
    inputs: [
      { name: "aaveAssets", type: "address[]" },
      { name: "uniswapTokenIds", type: "uint256[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    stateMutability: "nonpayable",
    name: "partialExit",
    inputs: [
      { name: "aaveAssets", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
      { name: "uniswapTokenIds", type: "uint256[]" },
    ],
    outputs: [],
  },
] as const satisfies Abi;

export const lockCheckerAbi = [
  {
    type: "function",
    stateMutability: "view",
    name: "getLockedAssets",
    inputs: [
      { name: "user", type: "address" },
      { name: "assets", type: "address[]" },
    ],
    outputs: [{ name: "locked", type: "address[]" }],
  },
] as const satisfies Abi;

export const aaveDataProviderAbi = [
  {
    type: "function",
    stateMutability: "view",
    name: "getReserveTokensAddresses",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [
      { name: "aTokenAddress", type: "address" },
      { name: "stableDebtTokenAddress", type: "address" },
      { name: "variableDebtTokenAddress", type: "address" },
    ],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "getUserReserveData",
    inputs: [
      { name: "asset", type: "address" },
      { name: "user", type: "address" },
    ],
    outputs: [
      { name: "currentATokenBalance", type: "uint256" },
      { name: "currentStableDebt", type: "uint256" },
      { name: "currentVariableDebt", type: "uint256" },
      { name: "principalStableDebt", type: "uint256" },
      { name: "scaledVariableDebt", type: "uint256" },
      { name: "stableBorrowRate", type: "uint256" },
      { name: "liquidityRate", type: "uint256" },
      { name: "stableRateLastUpdated", type: "uint40" },
      { name: "usageAsCollateralEnabled", type: "bool" },
    ],
  },
] as const satisfies Abi;

export const erc20Abi = [
  {
    type: "function",
    stateMutability: "view",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "remaining", type: "uint256" }],
  },
  {
    type: "function",
    stateMutability: "nonpayable",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "ok", type: "bool" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "symbol",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const satisfies Abi;

export const assetOracleAbi = [
  {
    type: "function",
    stateMutability: "view",
    name: "getAssetPrice",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [{ name: "price", type: "uint256" }],
  },
] as const satisfies Abi;

// --- Uniswap V3 ABIs ---

export const nftManagerAbi = [
  {
    type: "function",
    stateMutability: "view",
    name: "balanceOf",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "tokenOfOwnerByIndex",
    inputs: [
      { name: "owner", type: "address" },
      { name: "index", type: "uint256" },
    ],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "positions",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      { name: "nonce", type: "uint96" },
      { name: "operator", type: "address" },
      { name: "token0", type: "address" },
      { name: "token1", type: "address" },
      { name: "fee", type: "uint24" },
      { name: "tickLower", type: "int24" },
      { name: "tickUpper", type: "int24" },
      { name: "liquidity", type: "uint128" },
      { name: "feeGrowthInside0LastX128", type: "uint256" },
      { name: "feeGrowthInside1LastX128", type: "uint256" },
      { name: "tokensOwed0", type: "uint128" },
      { name: "tokensOwed1", type: "uint128" },
    ],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "isApprovedForAll",
    inputs: [
      { name: "owner", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    stateMutability: "nonpayable",
    name: "setApprovalForAll",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
] as const satisfies Abi;

export const uniswapPoolAbi = [
  {
    type: "function",
    stateMutability: "view",
    name: "slot0",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
  },
] as const satisfies Abi;

export function toAddressSet(values: readonly string[]): Set<string> {
  return new Set(values.map((value) => value.toLowerCase()));
}
