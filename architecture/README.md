# Architecture Overview (Phase 0)

## Purpose of this folder
This folder documents how the PANIK Phase 0 codebase is structured, what each contract is responsible for, and how frontend/backend logic should align with deployed smart-contract behavior.

It is the source of truth for:
- Component boundaries
- Contract responsibilities
- Execution order
- Phase 0 constraints and non-goals

## System boundary
- Chain: Base Sepolia (`84532`)
- Core protocol dependency: Aave V3 Base Sepolia
- Swap routing dependency: Uniswap UniversalRouter
- Demo pricing dependency: `MockPriceOracle` (for custom demo tokens only)
- Frontend/backend role: prepare inputs and user decisions; contract layer enforces final execution rules

## Contract responsibility matrix

| Component | Purpose | Type |
|---|---|---|
| `PanikExecutor.sol` | Single external entrypoint that orchestrates full exit flow and emits `ExitCompleted`. | Write/orchestration |
| `LockChecker.sol` | Pre-flight read-only lock detection (cooldown, frozen reserve, zero liquidity). | Read-only |
| `libraries/SequenceLib.sol` | Builds execution order: variable debt (USDC first), stable debt, collateral withdraw, swap list. | Pure/view library |
| `adapters/AaveAdapter.sol` | Wraps Aave Pool operations (`repay`, `withdraw`, `getUserAccountData`) and HF improvement check. | Write + read |
| `adapters/SwapAdapter.sol` | Executes swaps through UniversalRouter with floor checks. | Write |
| `mocks/MockPriceOracle.sol` | Testnet-only asset price source for demo tokens. | Write + read |

## Phase 0 behavior constraints
- `PanikExecutor` is the only user-callable entrypoint.
- `atomicExit(address[])` and `partialExit(address[],uint256[])` are the only external exit calls.
- Non-reentrancy is enforced on both entrypoints.
- EOA-only callers are enforced.
- No owner/admin/pause/upgrade patterns.
- No flash loans in this phase.
- No aggregator pathing, no Aerodrome integration, no LP position handling.

## Frontend/backend alignment notes
- The frontend should treat unsupported routes/assets as non-eligible before confirmation.
- Lock reasons should be displayed as product-level status badges, but final authority is contract pre-flight.
- Flash-loan UX controls must be hidden/disabled in current Phase 0.
- For execution details and sequence, see `execution-flow.md`.
