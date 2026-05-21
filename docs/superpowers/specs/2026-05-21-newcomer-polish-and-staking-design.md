# Newcomer Polish + Staking — Design Spec

**Date:** 2026-05-21
**Feature:** Make the app clearer for a true newcomer — remove a non-functional UI element,
focus the quick actions on the essentials, make the full capability set discoverable, and add
a staking read tool.
**Status:** Design approved, ready for implementation plan
**Builds on:** "Talk to Injective" + wallet-connect (see the two prior specs in this folder).

## 1. Goals

1. **Remove the `mainnet` pill** — there's no network switching, so it's non-functional; the
   "live data" message it implied is already in the welcome line, and the chrome is now fuller
   with the Connect button.
2. **Refocus the quick-action chips** to the few key actions a newcomer actually needs (not
   every capability — most users don't stake, and "governance" is jargon).
3. **Make the full functionality discoverable** without UI clutter: a capability-aware system
   prompt so asking "what can you do?" returns an accurate, friendly tour of everything the app
   does.
4. **Add a staking read tool** (a real capability newcomers ask about — passive income).

## 2. Quick-action chips (3, focused)

Each chip is `{ label, text }` — the label is friendly UI text, the text is what gets sent.

**Disconnected:**
1. `New here? What is Injective & what can you do?` → "What is Injective, and what can you do?"
2. `Peek inside a sample wallet` → `What's in <DEMO_ADDRESS>?`
3. `How's INJ doing?` → "How's INJ doing?"

**Connected:** same, but chip 2 becomes
`What's in my wallet?` → `What's in <connected address>?`

Removed from the chip set (still fully supported by the agent, just not surfaced as chips):
open positions, governance, market funding detail, staking. These remain reachable by typing
and are listed in the capability tour.

## 3. Discoverability via capability-aware system prompt

The agent's real capabilities are its tools. `lib/llm.ts`'s system prompt gains an explicit,
accurate capability list so that "what can you do?" (and the chip in §2) yields a complete,
plain-English tour. The list:
- Read any wallet by its `inj1` address: token balances and open derivative (perp) positions.
- Market snapshot for any Injective perp market: price, funding rate, open interest.
- Governance: list active proposals and explain any proposal in plain English.
- Staking: the estimated APR for staking INJ, and a wallet's delegations + pending rewards.
- All from live Injective mainnet data; read-only, never trades.

This is the discoverability mechanism — conversational, no persistent UI panel.

## 4. Staking tool — `getStaking(address?)`

A backend tool (like `getMarketSnapshot` / `getPortfolio`), registered in `tools.ts`.

**Always (no address needed):**
- **Estimated APR** for staking INJ.
- **Total INJ staked** network-wide.

**If an address is given (e.g. connected wallet):**
- The wallet's **total staked INJ**, **validator count**, and **pending rewards (INJ)**.

**Data sources (`@injectivelabs/sdk-ts`, mainnet):**
- `ChainGrpcMintApi.fetchAnnualProvisions()` — annual INJ minted.
- `ChainGrpcStakingApi.fetchPool()` — `bondedTokens` (network total staked).
- `ChainGrpcDistributionApi.fetchModuleParams()` — `communityTax`.
- `ChainGrpcStakingApi.fetchDelegationsNoThrow({ injectiveAddress })` — wallet delegations.
- `ChainGrpcDistributionApi.fetchDelegatorRewardsNoThrow(address)` — wallet pending rewards.

**APR formula (estimate):**
`aprFraction = (annualProvisions / bondedTokens) * (1 - communityTax)`
Both `annualProvisions` and `bondedTokens` are INJ base units (18 decimals), so the ratio is
unit-free — no decimal scaling, fewer bugs. Rendered with `formatPercent`, and **always
described to the user as an estimate**. Token amounts use the existing `formatTokenAmount`.

**Return shape:**
```ts
interface StakingInfo {
  aprPercent: string;          // e.g. "12.4%" (estimate)
  totalBondedInj: number;      // network-wide staked INJ
  wallet?: {                   // present only when an address is supplied
    totalStakedInj: number;
    validatorCount: number;
    pendingRewardsInj: number;
  };
}
```

**Error handling (boundaries):** the `NoThrow` delegation/reward calls return empty → zeros for
the wallet section (a valid "you have nothing staked" answer). If the network APR inputs fail,
surface a graceful "couldn't read staking data right now" rather than crashing. Invalid address
→ same validation as `getPortfolio` (reject non-`inj1`).

## 5. Components / files

```
app/page.tsx              modified — remove mainnet pill; 3-chip suggestions(address)
app/globals.css           modified — remove now-unused .net rules
lib/llm.ts                modified — capability list added to the system prompt
lib/injective/client.ts   modified — add chainMintApi, chainStakingApi, chainDistributionApi
lib/injective/staking.ts  new — getStakingData(address?) + stakingTool
lib/injective/tools.ts    modified — register getStaking
tests/staking.test.ts     new — integration tests (mainnet read)
```

No new runtime dependencies.

## 6. Testing

- **Staking integration (`tests/staking.test.ts`, mainnet read):**
  - `getStakingData()` → `aprPercent` matches a percent string and the numeric APR is sane
    (`0 < apr < 100`); `totalBondedInj > 0`.
  - `getStakingData(<a real delegator address derived from chain>)` → `wallet` present;
    `totalStakedInj >= 0`, `validatorCount >= 0`, `pendingRewardsInj >= 0`, all numbers.
  - Reuse the "derive a real address from chain" pattern (or a known funded fallback).
- **System prompt / chips:** verified in a browser — the "What is Injective & what can you do?"
  chip returns a tour mentioning wallet, market, governance, and staking; the mainnet pill is
  gone; the 3 chips render (disconnected and, via stub, connected).
- **Full suite + typecheck + production build** green at the end (existing 22 tests + staking).

## 7. Out of scope

No staking transactions (delegate/undelegate) — read-only. No new chips beyond the three. No
persistent capabilities panel (discoverability is conversational). No precise per-validator APR
(single network estimate only).
