# PANIK Phase 0 Smart Contracts

Hardhat workspace for PANIK Phase 0 (Base Sepolia only), focused on atomic Aave V3 emergency-exit flows that end in USDC.

## Scope
- Network: Base Sepolia (`84532`)
- Solidity: `0.8.24`
- Single user entrypoint: `PanikExecutor`
- Supported in current MVP: Aave-based flows with configured swap routes
- Tracked-asset scan surface now available on-chain via `PanikExecutor.getTrackedAssets()`
- Explicitly excluded in Phase 0: flash loans, admin keys, pause, upgradeability, multi-wallet, backend execution logic

## Tooling
- Hardhat + TypeScript
- OpenZeppelin Contracts (`ReentrancyGuard`, `SafeERC20`)
- Ethers v6 via Hardhat toolbox

## Quick start
```bash
npm install
cp .env.example .env
npm run build
npm test
npm run deploy:mock-oracle
npm run deploy:executor-only
npm run export:abi
```

## Repository map (purpose and description)

### `contracts/`
On-chain logic for Phase 0.
- `PanikExecutor.sol`: orchestration entrypoint (`atomicExit`, `partialExit`)
- `LockChecker.sol`: read-only lock classification (cooldown/frozen/zero-liquidity)
- `adapters/AaveAdapter.sol`: Aave pool wrapper (`repay`, `withdraw`, HF checks)
- `adapters/SwapAdapter.sol`: Uniswap UniversalRouter swap wrapper
- `libraries/SequenceLib.sol`: deterministic ordering (debt before collateral)
- `mocks/`: local test-only mocks
- `interfaces/`: minimal external protocol interfaces

### `scripts/`
Deployment and ABI export scripts.
- `deploy.ts`: full stack deployment
- `deploy-mock-oracle.ts`: deploy only `MockPriceOracle`
- `deploy-executor-only.ts`: redeploy only `PanikExecutor` with updated routes
- `export-abi.ts`: writes ABI JSON files into `abi/`

### `deploy/`
Deployment artifacts and human-readable notes.
- `addresses.base-sepolia.json`: latest full deployment output
- `panik-executor.base-sepolia.json`: latest executor-only deployment output
- `mock-oracle.base-sepolia.json`: mock oracle deployment output
- `README.md`: constructor args, checklist, frontend integration notes

### `test/`
Hardhat tests for success and unhappy paths (EOA restrictions, slippage reverts, lock checks, rollback behavior).

### `architecture/`
Detailed architecture and flow documentation for product, backend, and frontend alignment.
- See `architecture/README.md`
- See `architecture/folder-map.md`
- See `architecture/execution-flow.md`

## Architecture docs
- [Architecture Overview](C:/Users/ASUS/Desktop/Panik/architecture/README.md)
- [Folder Purpose Map](C:/Users/ASUS/Desktop/Panik/architecture/folder-map.md)
- [Execution Flow](C:/Users/ASUS/Desktop/Panik/architecture/execution-flow.md)
- [Deployment Notes](C:/Users/ASUS/Desktop/Panik/deploy/README.md)

## Frontend simulator
- Frontend app location: `frontend/`
- Frontend runbook: `frontend/README.md`
- Screen 1 runs in live scan mode (full tracked Aave assets)
- Quick commands:
```bash
cd frontend
npm install
npm run sync:onchain
npm run dev
```

## Prompt Guide: Simple Frontend Simulator

Use this when asking an AI coding assistant to generate a lightweight frontend that simulates the smart-contract workflows.

### Goal
Create a minimal React + Viem + Wagmi app that:
- Connects wallet
- Enforces Base Sepolia (`84532`)
- Reads eligibility/status
- Simulates panic/cautious flow UI
- Calls `atomicExit` / `partialExit` on the deployed `PanikExecutor`

### Important constraints to include in prompt
- Phase 0 is **EOA-only**
- **No flash loans**
- Aave-focused workflow only
- USDC output only
- Show unsupported/locked assets as non-selectable
