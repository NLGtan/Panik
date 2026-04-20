const mappedErrors: Record<string, string> = {
  CallerNotEOA: "EOA wallets only in Phase 0. Smart contract wallets are blocked.",
  LockedPositions: "One or more selected positions are locked or not currently exitable.",
  InsufficientDebtAssetBalance:
    "The contract doesn't have enough balance to repay a debt position. This can happen with high supply/borrow amounts.",
  InvalidRepayAmount:
    "Debt repayment amount mismatch. The position's debt may have changed since scanning. Try refreshing and re-scanning.",
  DuplicateAsset: "Duplicate asset detected in exit list. Please deselect and re-select positions.",
  InvalidTrackedAsset:
    "One or more selected assets are not tracked by the executor contract.",
  MissingAToken:
    "A required aToken address could not be resolved for one of the selected assets.",
  PriceUnavailable:
    "Oracle price is unavailable for one of the selected assets. The market may be temporarily paused.",
  SafeERC20FailedOperation:
    "A token transfer or approval failed. Ensure PANIK approvals are set and retry.",
  LengthMismatch:
    "Array length mismatch in contract call arguments.",
  ReentrancyGuardReentrantCall:
    "Reentrancy detected — please retry the transaction.",
  "0xba914df4":
    "Contract function selector mismatch. Please hard-refresh the page (Ctrl+Shift+R) and retry.",
  "0xea9f4b10":
    "USDC allowance to PANIK Executor is missing or too low. Click Enable PANIK once again.",
  "0xfb8f41b2":
    "A required token allowance is missing (usually aToken). Complete Enable PANIK once before confirming exit.",
  "0x0b9082ff":
    "Adapter is not linked to the active PANIK Executor. Re-link adapter executors, then retry.",
  MissingSwapRoute: "At least one selected asset is missing a required swap route.",
  SlippageExceeded:
    "Swap output was below the minimum floor. Try fewer positions or retry later.",
  "already known":
    "This approval/transaction is already pending in the network mempool. Please wait a few seconds and retry.",
  "execution reverted":
    "Transaction reverted on-chain. This may happen when supply/borrow amounts are very high or liquidity is insufficient.",
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
