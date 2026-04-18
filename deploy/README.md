# Base Sepolia Deployment Notes (Phase 0)

## Constructor args

### `LockChecker`
1. `dataProvider` (`address`) - Aave Protocol Data Provider
2. `stableDebtCooldownSeconds` (`uint256`) - cooldown window threshold

### `AaveAdapter`
1. `pool` (`address`) - Aave V3 Pool

### `SwapAdapter`
1. `universalRouter` (`address`) - Uniswap V3 UniversalRouter
2. `usdc` (`address`) - canonical USDC token for output

### `PanikExecutor`
1. `usdc` (`address`)
2. `dataProvider` (`address`)
3. `marketOracle` (`address`) - Aave market oracle
4. `mockOracle` (`address`) - demo-token oracle
5. `lockChecker` (`address`)
6. `aaveAdapter` (`address`)
7. `swapAdapter` (`address`)
8. `swapAssets` (`address[]`) - assets that require swap routes
9. `swapPaths` (`bytes[]`) - packed V3 path (`tokenIn + fee + tokenOut`)
10. `swapMinOutBps` (`uint16[]`) - minimum floor in basis points
11. `mockOracleAssets` (`address[]`) - assets forced to use mock oracle
12. `trackedAssets` (`address[]`) - assets exposed by `getTrackedAssets()` for scan/list flows
13. `swapDeadlineBuffer` (`uint256`) - seconds added to current block timestamp

## Deployment command

```bash
npm run deploy:base-sepolia
```

Outputs are saved to:

`deploy/addresses.base-sepolia.json`

## Base Sepolia Route Snapshot (current)
- Works with liquidity:
  - `USDC (Aave) -> USDC` (fee `500`)
  - `WETH -> USDC` (fee `3000` route in current config)
- No usable pools found yet:
  - `USDT`
  - `WBTC`
  - `cbETH`
  - `LINK`
- Recommendation:
  - Keep all of the above in `TRACKED_ASSETS` for scan visibility.
  - Keep only liquid pairs in `SWAP_ASSETS` until new pools are created/seeded.

## ABI export

```bash
npm run build
npm run export:abi
```

ABIs are written to:

`abi/`

## Short checklist
1. Confirm network is Base Sepolia (`84532`).
2. Fill `.env` with Aave/Uniswap/USDC/oracle addresses.
3. Verify `SWAP_ASSETS`, `SWAP_PATHS`, `SWAP_MIN_OUT_BPS` list lengths match.
4. Set `TRACKED_ASSETS` to all assets you want shown in scan flows.
5. Run `npm run build` and `npm test`.
6. Deploy with `npm run deploy:base-sepolia`.
7. Export ABIs with `npm run export:abi`.
8. Verify deployed addresses in `deploy/addresses.base-sepolia.json`.

## Frontend integration needs
1. `PanikExecutor` deployed address.
2. `PanikExecutor` ABI (`abi/PanikExecutor.json`).
3. Tracked assets from `PanikExecutor.getTrackedAssets()` plus UI metadata mapping.
4. ERC-20 approvals for debt assets and AToken approvals to `PanikExecutor`.
5. Wallet/network guard to enforce Base Sepolia chain ID `84532`.
