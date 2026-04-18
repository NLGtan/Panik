# Execution Flow (Phase 0)

## Atomic exit flow

1. Frontend prepares eligible assets list and calls `atomicExit(assets)` on `PanikExecutor`.
2. `PanikExecutor` enforces:
   - `nonReentrant`
   - EOA-only caller
3. `LockChecker.getLockedAssets(user, assets)` runs pre-flight checks:
   - Stable debt cooldown active
   - Reserve frozen
   - Reserve has zero liquidity
4. If any asset is locked, execution reverts.
5. `SequenceLib.buildExitSequence(...)` creates deterministic order:
   - Variable debt repay (USDC first)
   - Stable debt repay
   - Collateral withdraw (highest USD value first)
   - Swap list for non-USDC assets
6. `AaveAdapter.repay(...)` executes debt repayment actions.
7. `AaveAdapter.assertHealthFactorImproved(...)` validates post-repay health factor direction before withdraw continuation.
8. `AaveAdapter.withdraw(...)` withdraws collateral.
9. For non-USDC collateral:
   - `SwapAdapter.swapToUSDC(...)` routes through UniversalRouter
   - Amount-out floor is enforced
10. Final USDC balance delta is transferred to `msg.sender`.
11. `ExitCompleted(user, usdcReceived, closed, locked)` is emitted.

Any error at any step reverts the full transaction (atomic rollback by EVM semantics).

## Partial exit flow

1. Frontend calls `partialExit(assets, amounts)` with matched array lengths.
2. Same checks and sequence apply as atomic flow.
3. Collateral amount per asset is bounded by selected partial amount.

## Frontend gating expectations

- Call `getSwapConfig(asset)` to determine route eligibility for non-USDC assets.
- Call lock checks or equivalent indexed read path before confirmation to classify non-eligible assets.
- Treat execution as all-or-nothing per submitted transaction.
- Do not show flash-loan controls in current Phase 0 deployment.

## Known MVP constraints

- Only configured swap routes are executable.
- Unsupported assets should be marked "can't exit" in UI.
- EOA-only caller rule blocks account-abstraction/smart-contract-wallet invocation.
