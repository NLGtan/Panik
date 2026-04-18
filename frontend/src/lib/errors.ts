const mappedErrors: Record<string, string> = {
  CallerNotEOA: "EOA wallets only in Phase 0. Smart contract wallets are blocked.",
  LockedPositions: "One or more selected positions are locked or not currently exitable.",
  InsufficientDebtAssetBalance:
    "Wallet balance is insufficient to repay one of the debt assets.",
  "0xea9f4b10":
    "USDC allowance to PANIK Executor is missing or too low. Click Enable PANIK Once again.",
  "0xfb8f41b2":
    "A required token allowance is missing (usually aToken). Complete Enable PANIK Once before confirming exit.",
  MissingSwapRoute: "At least one selected asset is missing a required swap route.",
  SlippageExceeded:
    "Swap output was below the minimum floor. Try fewer positions or retry later.",
  "already known":
    "This approval/transaction is already pending in the network mempool. Please wait a few seconds and retry.",
};

export function mapContractError(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : typeof error === "string" ? error : "Transaction failed.";

  for (const [key, value] of Object.entries(mappedErrors)) {
    if (raw.includes(key)) {
      return value;
    }
  }

  if (raw.toLowerCase().includes("user rejected")) {
    return "You rejected the wallet signature request.";
  }

  return raw;
}
