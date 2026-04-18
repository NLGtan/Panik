# PANIK Phase 0 Frontend Simulator

Minimal React + TypeScript + Vite frontend that simulates PANIK Phase 0 contract workflows on Base Sepolia using Viem + Wagmi.

## What this frontend does
- Connect/disconnect wallet (injected wallets)
- Enforce Base Sepolia (`chainId 84532`)
- EOA-only UI guard (checks bytecode on wallet address)
- Live scan mode on Screen 1: scans all tracked Aave assets
- Read on-chain route + lock status:
  - `PanikExecutor.getSwapConfig(asset)`
  - `PanikExecutor.getTrackedAssets()` (if available on deployed executor)
  - `LockChecker.getLockedAssets(user, assets)`
- Show asset tags:
  - `Eligible`
  - `Locked / Not eligible`
  - `Route missing`
- Scan shows only assets where user has an actual Aave position
  (`currentATokenBalance > 0` or debt > 0), not just wallet faucet balances
- Simulate PANIK flow screens:
  - Screen 1 -> Screen 2 -> Screen 1.5 -> Screen 3 -> Screen 4
- Submit exit calls with preflight:
  - `simulateContract`
  - `estimateContractGas`
  - then wallet signature/send

Flash-loan controls are intentionally hidden for Phase 0.

## Folder map
- `src/App.tsx`: screen flow, wallet/network guards, transaction flow
- `src/wagmi.ts`: wagmi + viem client setup
- `src/config/appConfig.ts`: single app config (chain + executor + assets)
  - `hiddenAssets` can exclude specific tracked assets from UI/selection
- `src/config/generated.ts`: auto-generated on-chain addresses from root deploy file
- `src/abi/PanikExecutor.json`: auto-copied ABI from root `abi/`
- `src/components/`: wallet panel, position list, status tags
- `src/lib/errors.ts`: revert-to-message mapping
- `scripts/sync-onchain-config.mjs`: sync root deployment + ABI into frontend

## Prerequisites
- Root contracts deployed to Base Sepolia
- Root files exist:
  - `../deploy/addresses.base-sepolia.json`
  - `../abi/PanikExecutor.json`
- Node.js 20+

## Setup
1. In this folder (`frontend`), copy env template:

```bash
cp .env.example .env
```

2. Set RPC URL in `.env` if needed:

```bash
VITE_BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
```

3. Install dependencies:

```bash
npm install
```

4. Sync on-chain config + ABI from root:

```bash
npm run sync:onchain
```

5. Start dev server:

```bash
npm run dev
```

## One demo transaction flow
1. Connect wallet.
2. If wrong network, click `Switch network` (must be `84532`).
3. Ensure wallet is EOA (if contract bytecode detected, exit stays disabled).
4. On Screen 1:
   - `Exit All` for panic path, or
   - `Select Positions` for cautious path.
5. Continue to Screen 3 and click `Confirm Exit`.
6. Frontend runs:
   - `simulateContract`
   - `estimateContractGas`
7. Sign transaction in wallet.
8. Watch `Executing` state and open tx on Basescan.
9. Screen 4 shows summary and tx link.

## Notes for demo reliability
- Keep only assets with valid swap routes in `src/config/appConfig.ts` if you want mostly-green demos.
- If you keep an asset with no route, it will intentionally show `Route missing` and be excluded from `Will Exit`.
- User-friendly revert mapping is in `src/lib/errors.ts`:
  - `CallerNotEOA`
  - `LockedPositions`
  - `InsufficientDebtAssetBalance`
  - `MissingSwapRoute`
  - `SlippageExceeded`
