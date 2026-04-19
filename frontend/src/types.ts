export type EntryPoint = "panic" | "cautious" | null;

export type ScreenKey =
  | "screen1"
  | "screen2"
  | "screen15"
  | "screen3"
  | "executing"
  | "screen4";

export type PositionTag = "eligible" | "locked" | "route_missing" | "not_eligible";

export interface AssetCandidate {
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
}

// --- Aave Position ---

export interface AavePositionView {
  id: string;
  protocol: "aave";
  asset: AssetCandidate;
  collateralAmount: bigint;
  stableDebtAmount: bigint;
  variableDebtAmount: bigint;
  routeEnabled: boolean;
  eligible: boolean;
  locked: boolean;
  tag: PositionTag;
  reason: string;
}

// --- Uniswap V3 LP Position ---

export interface UniswapPositionView {
  id: string;
  protocol: "uniswap";
  tokenId: bigint;
  token0: `0x${string}`;
  token1: `0x${string}`;
  symbol0: string;
  symbol1: string;
  feeTier: string;
  fee: number;
  liquidity: bigint;
  inRange: boolean;
  tokensOwed0: bigint;
  tokensOwed1: bigint;
  eligible: boolean;
  locked: boolean;
  tag: PositionTag;
  reason: string;
}

// --- Discriminated union ---

export type PositionView = AavePositionView | UniswapPositionView;

// --- Helpers ---

export function isAavePosition(p: PositionView): p is AavePositionView {
  return p.protocol === "aave";
}

export function isUniswapPosition(p: PositionView): p is UniswapPositionView {
  return p.protocol === "uniswap";
}

// --- Tx Summary ---

export interface TxSummary {
  hash: `0x${string}`;
  selectedAaveAssets: string[];
  functionName: "atomicExit";
  gasEstimate: bigint;
}

// --- Approval ---

export interface ApprovalToken {
  address: `0x${string}`;
  symbol: string;
}

export interface NftApprovalConfig {
  address: `0x${string}`;
  symbol: string;
  enabled: boolean;
  description: string;
}
