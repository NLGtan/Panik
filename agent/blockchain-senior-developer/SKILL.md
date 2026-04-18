---
name: blockchain-seniority
description: >
  A guide for thinking, evaluating, and operating at the senior level as a blockchain/Web3 developer.
  Use this skill whenever the user asks about: growing as a blockchain dev, reviewing smart contract
  code for risks, thinking about DeFi security, understanding MEV or game theory in contracts,
  explaining salary gaps in Web3, evaluating a junior vs senior blockchain engineer, or any question
  about what separates good from great in smart contract development. Also trigger when the user
  shares Solidity code and wants a senior-level review, or asks "how does this break?" style questions.
---

# Blockchain Seniority Skill

This skill encodes the judgment, thinking patterns, and mental models that separate a $80K blockchain
developer from a $210K one. It is not about syntax — it is about how you think.

---

## The Core Principle

> Technical skill is the baseline. Judgment is the differentiator.

At the senior level, everyone can write Solidity. What compounds your value is how you think about
systems, risks, incentives, and communication.

---

## The 5 Mental Models of a Senior Blockchain Dev

### 1. Adversarial Thinking — "How does this break?"

Never ask only "does this work?" Always ask "how does this fail or get exploited?"

**Think in invariants** — rules that must always be true:
- "Total withdrawals must never exceed total deposits"
- "A user balance must never go negative"
- "Only the owner can call this function"

Then try to violate each invariant. For every function, ask:

| Attack Vector | Question to Ask |
|---|---|
| Reentrancy | Can someone call this again before state updates? |
| Integer overflow | What happens at max uint256? |
| Flashloan manipulation | Can someone borrow millions, break an assumption, repay — in one tx? |
| Front-running | Can a bot see this in the mempool and act first? |
| Oracle manipulation | Can price data be manipulated before this executes? |
| Access control | Is every sensitive function properly gated? |
| Zero / edge inputs | What happens with 0, max value, or empty arrays? |
| Reentrancy via tokens | Does the token contract called here have a hook that re-enters? |

**Why it matters:** Smart contracts are immutable after deployment. You cannot patch them.
One missed edge case = permanent loss of funds. This mindset is worth $130K.

---

### 2. Economic Awareness — Think in Incentives, Not Just Logic

Smart contracts are incentive systems. Real people with money will find every profitable edge.

**Key concepts to internalize:**

**MEV (Maximal Extractable Value)**
Validators/miners can reorder, insert, or censor transactions within a block.
- Ask: "Can a bot front-run or sandwich this transaction for profit?"
- Ask: "Does transaction ordering affect the fairness or safety of this protocol?"

**Governance Exploits**
Protocols with token voting can be attacked through governance itself.
- Ask: "Can someone flashloan enough tokens to pass a malicious proposal and drain the treasury?"
- Ask: "Is there a timelock? Is it long enough?"

**Liquidity Death Spirals**
When token price falls → liquidity leaves → price falls more → repeat.
- Ask: "Does this protocol design create a situation where rational panic is self-fulfilling?"
- Ask: "What happens under extreme market stress — not normal conditions?"

**The rule:** For every mechanism, ask: "If someone had $10M and wanted to profit by breaking this,
how would they do it?" If you can answer that question, you've found the risk.

---

### 3. Communication That Builds Trust

Senior devs translate complexity into clarity. Founders and non-technical stakeholders make decisions
based on what you tell them — your communication directly affects their risk exposure.

**What to practice:**

- **Explain risks in plain language.** Not "there are potential edge cases" but "this function could
  be drained if called twice in the same block — here's why and here's the fix."
- **Give honest timelines.** Being wrong occasionally is better than being vague always.
- **Quantify risk when possible.** "This is low risk" vs "this could lose up to 100% of TVL under
  this specific condition."
- **Write post-mortems.** After every incident or near-miss, document what happened, why, and what
  changes were made.

**The compound effect:** Trust is slow to build and fast to lose. Every clear, accurate explanation
makes you more valuable than your code alone.

---

### 4. Push Back on Requirements

The most valuable contribution is sometimes: "You don't need this — build this instead."

**When to push back:**
- The requirement adds attack surface without proportional user value
- The architecture will cause scaling or security problems later
- A simpler design achieves the same goal with less risk
- The feature conflicts with a core protocol invariant

**How to push back well:**
1. Understand the goal behind the requirement, not just the requirement itself
2. Propose an alternative, don't just say no
3. Quantify the risk of the original approach
4. Let the decision-maker decide — your job is to inform, not override

**Why this matters in blockchain specifically:** Unlike web apps, bad design decisions in smart
contracts are permanent. Pushing back before deployment can save months of work and millions in
potential exploit losses.

---

### 5. Principles Over Patterns — Understand the EVM Deeply

Juniors copy patterns. Seniors understand why the pattern exists.

**What deep EVM knowledge looks like:**
- Understanding storage layout and how it affects gas and proxy patterns
- Knowing the difference between `call`, `delegatecall`, and `staticcall` and when each is dangerous
- Understanding how the call stack works and why deep call chains can cause issues
- Knowing how `tx.origin` differs from `msg.sender` and why it matters
- Understanding how gas limits affect loops and why unbounded arrays are dangerous
- Knowing how ABI encoding works and why malformed calldata can be exploited

**The practical test:** Can you read a protocol you've never seen and predict where the risks are —
without running it? That's the level to aim for.

---

## Code Review Checklist (Senior Level)

When reviewing any smart contract, go through these categories:

### Access Control
- [ ] Are all sensitive functions gated with proper modifiers?
- [ ] Is ownership transfer two-step (propose + accept)?
- [ ] Are there any functions that should be `internal` but are `public`?

### State Management
- [ ] Does every function that sends ETH/tokens update state *before* the external call? (checks-effects-interactions)
- [ ] Are there any state variables that can be manipulated by external calls?
- [ ] Is there any shared mutable state that two transactions could race on?

### Math & Inputs
- [ ] Are there division operations that could result in zero due to rounding?
- [ ] Are there multiplication operations that could overflow (if not using Solidity 0.8+)?
- [ ] What happens with zero inputs, max inputs, and empty arrays?

### External Calls
- [ ] Does calling an external contract expose a reentrancy vector?
- [ ] Is the return value of external calls checked?
- [ ] Could a malicious token contract exploit a callback hook here?

### Economic Design
- [ ] Can price oracles be manipulated in the same transaction (flashloan)?
- [ ] Is there any MEV exposure (front-running, sandwich attacks)?
- [ ] Does the incentive structure hold under extreme market conditions?

### Upgradability (if applicable)
- [ ] Are storage slots preserved across upgrades?
- [ ] Is there a timelock on upgrades?
- [ ] Who controls the upgrade key and what are the multisig requirements?

---

## Salary Translation

| Level | What They Do | Mindset |
|---|---|---|
| $80K | Writes code that works | "Does this work?" |
| $120K | Writes code that works and is tested | "Does this work under normal conditions?" |
| $160K | Writes code that is secure and tested | "How does this break?" |
| $210K+ | Shapes what gets built and why | "Should we build this at all?" |

The jump from each level isn't more knowledge — it's a different way of thinking.

---

## Resources to Internalize

- [Ethereum Yellow Paper](https://ethereum.github.io/yellowpaper/paper.pdf) — EVM fundamentals
- [Smart Contract Weakness Classification (SWC)](https://swcregistry.io/) — known vulnerability patterns
- [Rekt News](https://rekt.news/) — real post-mortems of exploited protocols
- [Trail of Bits Blog](https://blog.trailofbits.com/) — deep security research
- [Paradigm CTF](https://ctf.paradigm.xyz/) — practice adversarial thinking hands-on