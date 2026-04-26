<p align="center">
  <img src="frontend/src/assets/icon/logo.png" alt="PANIK" height="48" />
</p>

<h1 align="center">PANIK</h1>

<p align="center">
  <strong>One Button. Total Exit.</strong><br/>
  Exit all your DeFi positions across multiple protocols in a single atomic transaction.
</p>

<p align="center">
  <a href="https://panik-six.vercel.app">Live Demo</a> &nbsp;·&nbsp;
  <a href="#architecture">Architecture</a> &nbsp;·&nbsp;
  <a href="#smart-contracts">Smart Contracts</a> &nbsp;·&nbsp;
  <a href="#how-it-works">How It Works</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Network-Base%20Sepolia-0052FF?style=flat-square&logo=ethereum" alt="Base Sepolia" />
  <img src="https://img.shields.io/badge/Solidity-0.8.24-363636?style=flat-square&logo=solidity" alt="Solidity" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/Viem-2.x-1C1C1C?style=flat-square" alt="Viem" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="MIT License" />
</p>

---

## The Problem

During DeFi crises, users face a **15–30 minute manual exit process** across multiple protocols — switching tabs, signing dozens of transactions, sequencing debt repayments before collateral withdrawals, and praying nothing fails halfway through.

| Crisis Event | Impact |
|---|---|
| **May 2021 Crash** | $662M in DeFi liquidations within 24 hours. Gas spiked to 1,500+ gwei. |
| **Nov 2022 · FTX Collapse** | $20.7B fled centralized exchanges in 11 days. No unified exit tool existed. |
| **Mar 2023 · USDC Depeg** | 3,400 Aave liquidations in hours. USDC fell to $0.87 in 5 hours. |

**PANIK solves this.** One button. One transaction. Total exit.

---

## What PANIK Does

PANIK is a **non-custodial, atomic DeFi emergency exit protocol** deployed on Base. It scans your open lending and LP positions, sequences the correct exit order on-chain, and executes everything in a single transaction — or reverts entirely so you lose nothing.

### Key Features

| Feature | Description |
|---|---|
| **Atomic Execution** | Repay debt → withdraw collateral → remove LP → swap to USDC — all in one transaction. If any step fails, the entire transaction reverts. |
| **Non-Custodial** | Your assets never leave your wallet until the signed transaction executes. PANIK holds nothing. |
| **Position Health Dashboard** | Real-time health factor, collateral value, debt breakdown, and lock status for every position. |
| **Partial Exit** | Choose exactly which positions to exit while keeping the same atomic safety guarantees. |
| **Pre-Flight Lock Detection** | Identifies cooldown periods, frozen reserves, and zero-liquidity states before execution. |
| **Multi-Protocol Support** | Exits both Aave V3 lending positions and Uniswap V3 LP positions in a single flow. |

---

## Architecture

<a name="architecture"></a>

```
┌──────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React + Viem + Wagmi)           │
│  Landing Page → Wallet Connect → Position Scan → Exit Flow       │
└────────────────────────────────┬─────────────────────────────────┘
                                 │ writeContract / readContract
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                      PanikExecutor.sol                            │
│         atomicExit(aaveAssets[], uniswapTokenIds[])               │
│         partialExit(aaveAssets[], amounts[], uniswapTokenIds[])   │
│              ┌────────────┬────────────┬────────────┐            │
│              ▼            ▼            ▼            ▼            │
│        LockChecker   SequenceLib  AaveAdapter  SwapAdapter       │
│        (pre-flight)  (ordering)  (repay/withdraw) (Uniswap)     │
│                                       │            │            │
│                                       ▼            ▼            │
│                                   Aave V3     UniversalRouter    │
│                                   Pool        + NFT Manager      │
└──────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
                          Base Sepolia (84532)
```

### Execution Flow

```
1. User connects wallet (EOA-only enforcement)
2. Frontend scans all tracked Aave reserves + Uniswap V3 NFT positions
3. LockChecker identifies locked/frozen/zero-liquidity assets
4. User selects positions (or "Exit All")
5. Approval gate ensures all aTokens, debt tokens, and LP NFTs are approved
6. PanikExecutor.atomicExit() fires:
   ├── Phase 1: Aave — SequenceLib orders debt repays (USDC first),
   │            then collateral withdrawals (highest USD value first)
   ├── Phase 2: Uniswap — remove liquidity + collect fees for each NFT
   ├── Phase 3: SwapAdapter routes all non-USDC tokens → USDC
   └── Phase 4: Final USDC sweep to user
7. ExitCompleted event emitted with USDC received, closed assets, locked assets
```

> **Atomic guarantee:** Any error at any step reverts the full transaction. No partial states. No stuck collateral.

---

## Smart Contracts

<a name="smart-contracts"></a>

All contracts are deployed and verified on **Base Sepolia (Chain ID: 84532)**.

| Contract | Address | Purpose |
|---|---|---|
| **PanikExecutor** | [`0xA28D...3557`](https://sepolia.basescan.org/address/0xA28D684B06a2711badEA447aA668b7dbb6de8557) | Single entrypoint — orchestrates full exit flow |
| **LockChecker** | [`0xB5f7...22C2`](https://sepolia.basescan.org/address/0xB5f730e8C2B658D3fFFdbC10536039ce4D6d22C2) | Pre-flight lock detection (cooldown/frozen/zero-liquidity) |
| **AaveAdapter** | [`0xeA20...6196`](https://sepolia.basescan.org/address/0xeA20247a26fe4D376bEbD490115c7D477D9d6196) | Wraps Aave Pool repay, withdraw, health factor checks |
| **SwapAdapter** | [`0xD796...b3C7`](https://sepolia.basescan.org/address/0xD79688CD542a19536d075A51d46000A70d41b3C7) | Routes swaps through Uniswap UniversalRouter with floor checks |
| **UniswapAdapter** | [`0x610A...DA1E`](https://sepolia.basescan.org/address/0x610A39dDcB59Af4F6ADC0D17cee8Cd51DE93DA1E) | Exits Uniswap V3 LP NFT positions (remove liquidity + collect) |

### Tracked Assets

| Symbol | Address | Type |
|---|---|---|
| USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | Settlement token |
| WETH | `0x4200000000000000000000000000000000000006` | Collateral / LP |
| USDT | `0x0a215D8ba66387DCA84B284D18c3B4ec3de6E54a` | Collateral |
| WBTC | `0x54114591963CF60EF3aA63bEfD6eC263D98145a4` | Collateral |
| cbETH | `0xD171b9694f7A2597Ed006D41f7509aaD4B485c4B` | Collateral / LP |
| LINK | `0x810D46F9a9027E28F9B01F75E2bdde839dA61115` | Collateral |

### Security Model

- **ReentrancyGuard** on all external exit entrypoints
- **EOA-only enforcement** — smart contract wallets cannot call exit functions
- **No admin keys, no pause, no upgradeability** — fully immutable
- **SafeERC20** for all token transfers
- **On-chain slippage protection** via oracle-derived minimum output floors
- **Health factor assertion** post-repay to ensure state improvement before withdrawals

---

## Tech Stack

### Smart Contracts
| Technology | Purpose |
|---|---|
| Solidity 0.8.24 | Contract language |
| Hardhat + TypeScript | Build, test, deploy framework |
| OpenZeppelin 5.x | ReentrancyGuard, SafeERC20, Math |
| Aave V3 | Lending protocol integration |
| Uniswap V3 | DEX routing + LP position management |

### Frontend
| Technology | Purpose |
|---|---|
| React 19 + TypeScript | UI framework |
| Vite 8 | Build tool |
| Wagmi 3 + Viem 2 | Wallet connection + contract interaction |
| TanStack Query | Async state management |
| Radix UI | Accessible component primitives |
| Tailwind CSS 3 | Utility-first styling |
| Lucide React | Icon system |

### Infrastructure
| Technology | Purpose |
|---|---|
| Base Sepolia | L2 deployment network |
| Vercel | Frontend hosting |
| BaseScan | Contract verification + explorer |

---

## Quick Start

### Prerequisites
- Node.js ≥ 18
- A wallet with Base Sepolia ETH (for gas)

### Smart Contracts

```bash
# Install dependencies
npm install

# Copy environment config
cp .env.example .env
# Edit .env with your RPC URL and deployer private key

# Compile contracts
npm run build

# Run tests
npm test

# Deploy (if needed)
npm run deploy:base-sepolia

# Export ABIs for frontend
npm run export:abi
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Sync on-chain config from deployment artifacts
npm run sync:onchain

# Start dev server
npm run dev
```

The app will be available at `http://localhost:5173`.

---

<a name="how-it-works"></a>

## How It Works — User Flow

### Step 1: Connect Wallet
Connect via MetaMask, Coinbase Wallet, or WalletConnect. PANIK automatically enforces Base Sepolia and verifies EOA status.

### Step 2: Scan & Review
The dashboard scans all tracked Aave reserves and Uniswap V3 LP NFTs owned by the connected wallet. Each position shows:
- **Health factor** and liquidation risk
- **Lock status** (cooldown, frozen, zero-liquidity)
- **Route readiness** (whether a swap path to USDC exists)

### Step 3: Choose Your Exit
- **[!] PANIC MODE** — Exit everything eligible in one click
- **[~] CAUTIOUS MODE** — Select individual positions to exit

### Step 4: Approve & Execute
The approval gate checks all required token allowances (aTokens, debt tokens, LP NFTs). Once approved, one transaction executes the entire exit. The confirmation screen shows the final USDC received.

---

## Repository Structure

```
panik/
├── contracts/                  # Solidity smart contracts
│   ├── PanikExecutor.sol       # Main orchestration entrypoint
│   ├── LockChecker.sol         # Pre-flight lock detection
│   ├── adapters/
│   │   ├── AaveAdapter.sol     # Aave V3 repay/withdraw wrapper
│   │   ├── SwapAdapter.sol     # Uniswap UniversalRouter swap wrapper
│   │   └── UniswapAdapter.sol  # Uniswap V3 LP exit (remove + collect)
│   ├── libraries/
│   │   └── SequenceLib.sol     # Deterministic exit ordering
│   ├── interfaces/             # Minimal external protocol interfaces
│   └── mocks/                  # Test-only mock contracts
├── test/                       # Hardhat test suite
├── scripts/                    # Deploy & utility scripts
├── deploy/                     # Deployment artifacts & addresses
├── architecture/               # Architecture docs & flow diagrams
├── abi/                        # Exported ABI JSON files
└── frontend/                   # React application
    ├── src/
    │   ├── pages/
    │   │   └── LandingPage.tsx # Marketing landing page
    │   ├── CoreApp.tsx         # Main dashboard + exit flow
    │   ├── components/         # UI components
    │   │   ├── PositionList    # Position display
    │   │   ├── WalletPanel     # Wallet connection header
    │   │   └── ApprovalGate    # Token approval management
    │   ├── hooks/              # Custom React hooks
    │   │   ├── usePanikApprovals  # Allowance management
    │   │   └── useUniswapPositions # LP NFT scanning
    │   └── config/             # On-chain config (auto-synced)
    └── scripts/
        └── sync-onchain-config # Pulls addresses from deploy artifacts
```

---

## Testing

```bash
# Run full test suite
npm test
```

Tests cover:
- [x] Atomic exit — full debt repay + collateral withdraw + swap to USDC
- [x] Partial exit — selective position unwinding
- [x] EOA-only restriction — revert on smart contract callers
- [x] Lock detection — cooldown, frozen reserve, zero-liquidity
- [x] Slippage protection — revert when output below oracle-derived floor
- [x] Reentrancy guard — blocked reentrant calls
- [x] Uniswap LP exit — remove liquidity + collect fees + swap proceeds

---

## Roadmap

| Phase | Status | Description |
|---|---|---|
| **Phase 0 (MVP)** | LIVE | Aave V3 + Uniswap V3 atomic exits on Base Sepolia |
| **Phase 1** | NEXT | Flash loan support for undercollateralized exits |
| **Phase 2** | PLANNED | Morpho, Aerodrome, and Compound integrations |
| **Phase 3** | PLANNED | Multi-chain support (Base Mainnet, Celo + MiniPay) |
| **Phase 4** | PLANNED | Alert system — automated exit triggers based on health factor thresholds |

---

## Team

Built for the Base ecosystem. Designed for the worst day in DeFi.

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>PANIK</strong> — Because the market doesn't wait for your exit queue.<br/>
  <sub>Built on Base · Atomic execution · Non-custodial · Zero partial states</sub>
</p>
