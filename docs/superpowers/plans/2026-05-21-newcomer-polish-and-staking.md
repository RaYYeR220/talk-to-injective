# Newcomer Polish + Staking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "Talk to Injective" clearer for true newcomers — drop the dead `mainnet` pill, refocus the quick-action chips to 3 essentials, make the full capability set discoverable via the system prompt, and add a read-only staking tool (estimated APR + a wallet's delegations/rewards).

**Architecture:** Two backend additions (three new gRPC API singletons in `client.ts`; a new `staking.ts` module + tool registered in `tools.ts`) and three presentation changes (capability list in the `lib/llm.ts` system prompt; 3-chip `suggestions()` + removed pill in `app/page.tsx`; removed `.net` CSS). The staking tool computes a network APR estimate from the mint/staking/distribution modules and, given an address, adds that wallet's delegations and pending rewards. All reads are mainnet, read-only.

**Tech Stack:** Next.js 16 (App Router) + React 19, TypeScript, Vercel AI SDK v6 (`tool()`), `@injectivelabs/sdk-ts` (ChainGrpcMintApi / ChainGrpcStakingApi / ChainGrpcDistributionApi), zod 4, Vitest 4 (node, real-mainnet integration tests).

**Spec:** `docs/superpowers/specs/2026-05-21-newcomer-polish-and-staking-design.md`

---

## Branch setup (do once, before Task 1)

The repo is currently on `master`. Do NOT implement on `master`.

- [ ] **Create the feature branch**

```bash
git checkout -b build/newcomer-staking
git status
```

Expected: `On branch build/newcomer-staking`, clean tree.

---

## File structure

```
lib/injective/client.ts    modify — add chainMintApi, chainStakingApi, chainDistributionApi
lib/injective/staking.ts   new    — getStakingData(address?) + stakingTool
lib/injective/tools.ts     modify — register getStaking
tests/staking.test.ts      new    — mainnet integration tests for getStakingData
lib/llm.ts                 modify — capability list added to SYSTEM_PROMPT
tests/system-prompt.test.ts new   — assert the capability tour keywords are present
app/page.tsx               modify — remove mainnet pill; 3-chip suggestions(address)
app/globals.css            modify — remove now-unused .net rules
```

Task order: backend first (staking is the riskiest, least-reversible piece, and the prompt references it), then the prompt, then the UI.

---

## Task 1: Staking read tool (clients + module + registration)

**Files:**
- Modify: `lib/injective/client.ts` (currently 14 lines)
- Create: `lib/injective/staking.ts`
- Modify: `lib/injective/tools.ts` (currently 10 lines)
- Test: `tests/staking.test.ts`

**Verified SDK facts (from the installed `@injectivelabs/sdk-ts` type defs — use exactly these shapes):**
- `ChainGrpcMintApi.fetchAnnualProvisions()` → `Promise<{ annualProvisions: string }>` (INJ base units, 18 dp)
- `ChainGrpcStakingApi.fetchPool()` → `Promise<{ notBondedTokens: string; bondedTokens: string }>` (base units)
- `ChainGrpcDistributionApi.fetchModuleParams()` → `Promise<{ communityTax: string; baseProposerReward: string; bonusProposerReward: string; withdrawAddrEnabled: boolean }>` (`communityTax` is a decimal string like `"0.05"`)
- `ChainGrpcStakingApi.fetchDelegationsNoThrow({ injectiveAddress })` → `Promise<{ delegations: Delegation[]; pagination }>`, where `Delegation = { delegation: { delegatorAddress; validatorAddress; shares }; balance: { denom: string; amount: string } }` (`balance.amount` = staked INJ base units)
- `ChainGrpcDistributionApi.fetchDelegatorRewardsNoThrow(injectiveAddress)` → `Promise<ValidatorRewards[]>`, where `ValidatorRewards = { rewards: Coin[]; validatorAddress: string }` and `Coin = { denom: string; amount: string }`. **It is an array, one entry per validator** — sum the `inj` coin across all entries.
- `ChainGrpcStakingApi.fetchValidators()` → `Promise<{ validators: Validator[]; pagination }>`, `Validator = { operatorAddress: string; status: 'Bonded'|'UnBonded'|'UnBonding'; ... }`
- `ChainGrpcStakingApi.fetchDelegatorsNoThrow({ validatorAddress })` → `Promise<{ delegations: Delegation[]; pagination }>` (used by the test to find a real delegator)

**APR estimate:** `aprFraction = (annualProvisions / bondedTokens) * (1 - communityTax)`. Both `annualProvisions` and `bondedTokens` are 18-dp base units, so the ratio is unit-free — no scaling. Render with `formatPercent(aprFraction, 3)` (3 sig figs → reads like `"12.4%"`). Always describe it to the user as an estimate (the tool description + the system prompt both say "estimated").

- [ ] **Step 1: Add the three chain API singletons to `client.ts`**

Replace the entire contents of `lib/injective/client.ts` with:

```ts
import { getNetworkEndpoints, Network } from '@injectivelabs/networks';
import {
  ChainGrpcBankApi,
  ChainGrpcGovApi,
  ChainGrpcMintApi,
  ChainGrpcStakingApi,
  ChainGrpcDistributionApi,
  IndexerGrpcDerivativesApi,
} from '@injectivelabs/sdk-ts';

// Mainnet, read-only. Switch network here only.
const endpoints = getNetworkEndpoints(Network.Mainnet);

export const chainBankApi = new ChainGrpcBankApi(endpoints.grpc);
export const chainGovApi = new ChainGrpcGovApi(endpoints.grpc);
export const chainMintApi = new ChainGrpcMintApi(endpoints.grpc);
export const chainStakingApi = new ChainGrpcStakingApi(endpoints.grpc);
export const chainDistributionApi = new ChainGrpcDistributionApi(endpoints.grpc);
export const indexerDerivativesApi = new IndexerGrpcDerivativesApi(endpoints.indexer);
```

- [ ] **Step 2: Write the failing test `tests/staking.test.ts`**

These are real mainnet reads (same pattern as `tests/portfolio.test.ts`). The wallet test derives a guaranteed-active delegator from a bonded validator, falling back to a known funded wallet.

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { chainStakingApi } from '../lib/injective/client';
import { getStakingData } from '../lib/injective/staking';

// Stable fallback if we can't derive a live delegator at run time.
const KNOWN_DELEGATOR = 'inj1p4qgrapyuxrurm0jyux9s2q8fn4ghsxwy24mt3';

let delegator = KNOWN_DELEGATOR;
beforeAll(async () => {
  // Prefer a guaranteed-active delegator: pick a bonded validator, take one of its delegators.
  try {
    const { validators } = await chainStakingApi.fetchValidators();
    const v = validators.find((x) => x.status === 'Bonded') ?? validators[0];
    const { delegations } = await chainStakingApi.fetchDelegatorsNoThrow({
      validatorAddress: v.operatorAddress,
    });
    const addr = delegations?.[0]?.delegation?.delegatorAddress;
    if (addr) delegator = addr;
  } catch {
    // keep fallback
  }
}, 30000);

describe('getStakingData (mainnet, read-only)', () => {
  it('returns a sane network APR and total bonded without an address', async () => {
    const res = await getStakingData();
    if ('error' in res) throw new Error(res.error);
    expect(res.aprPercent).toMatch(/^\d+(\.\d+)?%$/);
    const apr = Number(res.aprPercent.replace('%', ''));
    expect(apr).toBeGreaterThan(0);
    expect(apr).toBeLessThan(100);
    expect(res.totalBondedInj).toBeGreaterThan(0);
    // human INJ (tens of millions), not raw base units (would be > 1e9)
    expect(res.totalBondedInj).toBeLessThan(1e9);
    expect(res.wallet).toBeUndefined();
  }, 30000);

  it('includes wallet staking details for a real delegator', async () => {
    const res = await getStakingData(delegator);
    if ('error' in res) throw new Error(res.error);
    expect(res.wallet).toBeDefined();
    const w = res.wallet!;
    expect(typeof w.totalStakedInj).toBe('number');
    expect(w.totalStakedInj).toBeGreaterThanOrEqual(0);
    expect(w.totalStakedInj).toBeLessThan(1e9); // human INJ, not base units
    expect(Number.isInteger(w.validatorCount)).toBe(true);
    expect(w.validatorCount).toBeGreaterThanOrEqual(0);
    expect(w.pendingRewardsInj).toBeGreaterThanOrEqual(0);
    expect(w.pendingRewardsInj).toBeLessThan(1e7); // catches a 10^18 scaling bug
  }, 30000);

  it('rejects a malformed address', async () => {
    const res = await getStakingData('not-an-address');
    expect('error' in res).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- staking`
Expected: FAIL — `Cannot find module '../lib/injective/staking'` (the module doesn't exist yet).

- [ ] **Step 4: Implement `lib/injective/staking.ts`**

```ts
import { tool } from 'ai';
import { z } from 'zod';
import { chainMintApi, chainStakingApi, chainDistributionApi } from './client';
import { formatTokenAmount, formatPercent } from './format';

const INJ_DECIMALS = 18;
const isInjAddress = (a: string) => /^inj1[0-9a-z]{38,}$/.test(a);

export interface StakingWallet {
  totalStakedInj: number;
  validatorCount: number;
  pendingRewardsInj: number;
}

export interface StakingInfo {
  aprPercent: string; // estimate, e.g. "12.4%"
  totalBondedInj: number; // network-wide staked INJ
  wallet?: StakingWallet; // present only when a valid address is supplied
}

export interface StakingError {
  error: string;
}

export type StakingResult = StakingInfo | StakingError;

export async function getStakingData(address?: string): Promise<StakingResult> {
  if (address != null && !isInjAddress(address)) {
    return { error: `"${address}" is not a valid Injective address (they start with "inj1").` };
  }

  let aprFraction: number;
  let totalBondedInj: number;
  try {
    const [{ annualProvisions }, pool, params] = await Promise.all([
      chainMintApi.fetchAnnualProvisions(),
      chainStakingApi.fetchPool(),
      chainDistributionApi.fetchModuleParams(),
    ]);
    // annualProvisions and bondedTokens are both INJ base units (18 dp), so the
    // ratio is unit-free; communityTax is a plain decimal fraction (e.g. 0.05).
    const bonded = Number(pool.bondedTokens);
    aprFraction =
      bonded > 0 ? (Number(annualProvisions) / bonded) * (1 - Number(params.communityTax)) : 0;
    totalBondedInj = formatTokenAmount(pool.bondedTokens, INJ_DECIMALS);
  } catch {
    return { error: "Couldn't read staking data right now — try again in a moment." };
  }

  const info: StakingInfo = {
    aprPercent: formatPercent(aprFraction, 3),
    totalBondedInj,
  };

  if (address != null) {
    // NoThrow variants return empty (not throw) when the wallet has no stake/rewards.
    const [delRes, validatorRewards] = await Promise.all([
      chainStakingApi.fetchDelegationsNoThrow({ injectiveAddress: address }),
      chainDistributionApi.fetchDelegatorRewardsNoThrow(address),
    ]);

    const delegations = delRes.delegations ?? [];
    const totalStakedInj = delegations.reduce(
      (sum, d) => sum + formatTokenAmount(d.balance.amount, INJ_DECIMALS),
      0,
    );
    // fetchDelegatorRewardsNoThrow returns one entry per validator; sum the INJ coin across all.
    const pendingRewardsInj = validatorRewards.reduce((sum, vr) => {
      const inj = (vr.rewards ?? []).find((c) => c.denom === 'inj');
      return sum + (inj ? formatTokenAmount(inj.amount, INJ_DECIMALS) : 0);
    }, 0);

    info.wallet = {
      totalStakedInj,
      validatorCount: delegations.length,
      pendingRewardsInj,
    };
  }

  return info;
}

export const stakingTool = tool({
  description:
    'Read Injective staking info (read-only). With no address: the estimated APR for staking INJ and the total INJ staked network-wide. With an "inj1" address: also that wallet\'s total staked INJ, number of validators, and pending (unclaimed) rewards. Use for "what is the staking APR?", "how much can I earn staking INJ?", or "what am I staking?". The APR is always an estimate.',
  inputSchema: z.object({
    address: z
      .string()
      .optional()
      .describe('Optional Injective bech32 address (starts with "inj1") to include that wallet\'s staking details.'),
  }),
  execute: async ({ address }) => getStakingData(address),
});
```

- [ ] **Step 5: Run the staking test to verify it passes**

Run: `npm test -- staking`
Expected: PASS — all 3 tests green (network APR sane, wallet section present for the derived delegator, malformed address rejected).

- [ ] **Step 6: Register the tool in `tools.ts`**

Replace the entire contents of `lib/injective/tools.ts` with:

```ts
import { portfolioTool } from './portfolio';
import { marketTool } from './market';
import { governanceTool } from './governance';
import { stakingTool } from './staking';

export const injectiveTools = {
  getPortfolio: portfolioTool,
  getMarketSnapshot: marketTool,
  getGovernance: governanceTool,
  getStaking: stakingTool,
};
```

- [ ] **Step 7: Run the full suite to confirm no regressions**

Run: `npm test`
Expected: PASS — all existing tests plus the 3 new staking tests (25 total).

- [ ] **Step 8: Commit**

```bash
git add lib/injective/client.ts lib/injective/staking.ts lib/injective/tools.ts tests/staking.test.ts
git commit -m "feat: add read-only staking tool (estimated APR + wallet delegations/rewards)"
```

---

## Task 2: Capability-aware system prompt

**Files:**
- Modify: `lib/llm.ts` (currently 20 lines; edit the `SYSTEM_PROMPT` template literal at lines 11-19)
- Test: `tests/system-prompt.test.ts`

The agent's real capabilities are its tools. Add an explicit, accurate capability list to the system prompt so "what can you do?" (and the disconnected chip in Task 3) yields a complete, plain-English tour including staking.

- [ ] **Step 1: Write the failing test `tests/system-prompt.test.ts`**

This is the automated form of the spec's "the tour mentions wallet, market, governance, and staking" check.

```ts
import { describe, it, expect } from 'vitest';
import { SYSTEM_PROMPT } from '../lib/llm';

describe('SYSTEM_PROMPT capability tour', () => {
  it('mentions every core capability so "what can you do?" is accurate', () => {
    const p = SYSTEM_PROMPT.toLowerCase();
    expect(p).toContain('wallet');
    expect(p).toContain('market');
    expect(p).toContain('governance');
    expect(p).toContain('staking');
  });

  it('states it is read-only / never trades', () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toMatch(/never trade|read-only|read only|only read/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- system-prompt`
Expected: FAIL on the `staking` assertion (the current prompt mentions wallet/market/governance but not staking).

- [ ] **Step 3: Add the capability list to `SYSTEM_PROMPT`**

In `lib/llm.ts`, replace the `SYSTEM_PROMPT` export (lines 11-19) with this version (intro paragraph unchanged; a "What you can do" block inserted before "Rules:"):

```ts
export const SYSTEM_PROMPT = `You are "Talk to Injective", a friendly guide that helps newcomers understand the Injective blockchain in plain English.

What you can do (your live, read-only tools):
- Look up any wallet by its "inj1" address: token balances and open derivative (perp) positions.
- Snapshot any Injective perp market: mark price, funding rate, and open interest.
- Governance: list active proposals, and explain any single proposal in plain English.
- Staking: the estimated APR for staking INJ, plus a wallet's delegations and pending rewards.
- Everything comes from live Injective mainnet data. You only read — you never trade.

When someone asks "what can you do?", give a short, friendly tour of the list above in plain language.

Rules:
- You ONLY read on-chain data via your tools. You never trade, never give financial advice, never tell anyone to buy or sell.
- When a question needs live data (a wallet, a market, governance, staking), call the matching tool. Never invent numbers, prices, or balances.
- Explain like the user is new to crypto: define jargon briefly (e.g. what funding rate or APR means) and keep answers short and clear.
- Staking APR is always an estimate — say so when you mention it.
- If a tool reports not-found or invalid input, say so plainly and suggest what to try instead.
- Addresses start with "inj1". If the user gives one, use it directly.
- Reply in plain text for a terminal UI: do NOT use Markdown (no **, no ##, no * bullets). Use short lines, and simple "- " dashes if you list things.`;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- system-prompt`
Expected: PASS — both assertions green.

- [ ] **Step 5: Commit**

```bash
git add lib/llm.ts tests/system-prompt.test.ts
git commit -m "feat: add capability tour to system prompt for discoverability"
```

---

## Task 3: Refocus chips + remove the mainnet pill

**Files:**
- Modify: `app/page.tsx` (the `suggestions()` function at lines 20-34; the pill at line 84)
- Modify: `app/globals.css` (the `.net` rules at lines 33-41 and line 118)

The 3 chips: a capability-tour chip, a wallet chip (sample address when disconnected, the connected address when connected), and an INJ market chip. Keep `short()` — it's still used by the wallet pill display. Keep `DEMO_ADDRESS` — still used by the disconnected wallet chip.

- [ ] **Step 1: Replace `suggestions()` in `app/page.tsx`**

Replace the whole `suggestions` function (lines 20-34) with:

```tsx
function suggestions(address: string | null): Suggestion[] {
  const walletChip: Suggestion = address
    ? { label: "What's in my wallet?", text: `What's in ${address}?` }
    : { label: 'Peek inside a sample wallet', text: `What's in ${DEMO_ADDRESS}?` };
  return [
    {
      label: 'New here? What is Injective & what can you do?',
      text: 'What is Injective, and what can you do?',
    },
    walletChip,
    { label: "How's INJ doing?", text: "How's INJ doing?" },
  ];
}
```

- [ ] **Step 2: Remove the mainnet pill from the chrome bar**

In `app/page.tsx`, inside the `<span className="right">` block, delete this line (line 84):

```tsx
          <span className="net">● mainnet</span>
```

Leave the rest of the `right` span (the wallet pill / chooser / Connect button) untouched.

- [ ] **Step 3: Remove the now-unused `.net` CSS**

In `app/globals.css`, delete the `.chrome .net` rule (lines 33-41):

```css
.chrome .net {
  margin-left: auto;
  font-size: 11px;
  padding: 3px 9px;
  border-radius: 4px;
  background: #0e2a30;
  color: #4fe0ef;
  border: 1px solid #1d4d56;
}
```

And delete the leftover override on line 118:

```css
.chrome .right .net { margin-left: 0; }
```

Keep `.chrome .right { margin-left: auto; display: flex; align-items: center; gap: 8px; }` (line 117) — it positions the wallet/Connect controls.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (no dangling references to the removed pill; `short` and `DEMO_ADDRESS` still used).

- [ ] **Step 5: Verify in the browser**

Run the dev server: `npm run dev` (then open http://localhost:3000).

Confirm (disconnected state — no wallet extension needed):
1. The chrome bar shows the traffic-light dots + `talk-to-injective` title + a `Connect` button, and **no `● mainnet` pill**.
2. Exactly **3 chips** render: `› New here? What is Injective & what can you do?`, `› Peek inside a sample wallet`, `› How's INJ doing?`.
3. Click `New here? What is Injective & what can you do?` → the reply is a friendly tour that mentions **wallets, markets, governance, and staking** (proves the Task 2 capability list reaches the model), and contains no Markdown.
4. Click `How's INJ doing?` → returns a real INJ mark price / funding (sanity that the chip text still routes to the market tool).

Stop the dev server when done (Ctrl+C).

> Connected-state note: the only connected-vs-disconnected difference is chip 2's label/text swap (`What's in my wallet?` → the connected address). The wallet plumbing is unchanged from the shipped wallet-connect feature, so this swap is verified by code review; a live extension is not required.

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx app/globals.css
git commit -m "feat: refocus quick actions to 3 chips and remove dead mainnet pill"
```

---

## Task 4: Full verification + production build

**Files:** none (verification gate).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — all existing tests + `staking` (3) + `system-prompt` (2). No failures.

- [ ] **Step 2: Production build (also typechecks)**

Run: `npm run build`
Expected: build succeeds with no type errors and no lint failures.

- [ ] **Step 3: Final smoke (optional but recommended)**

If not already done in Task 3 Step 5, run `npm run dev` once more and confirm the three chips + capability tour + no pill, then stop the server.

No commit needed for this task (verification only). After this, hand off to **superpowers:finishing-a-development-branch** to merge `build/newcomer-staking` → `master` and push.

---

## Self-Review

**Spec coverage** (against `2026-05-21-newcomer-polish-and-staking-design.md`):
- §1.1 remove mainnet pill → Task 3 Steps 2-3 ✓
- §1.2 / §2 refocus to 3 chips (connected swaps chip 2) → Task 3 Step 1 ✓
- §1.3 / §3 discoverability via capability-aware system prompt → Task 2 ✓
- §1.4 / §4 staking tool `getStaking(address?)`, APR + total bonded, wallet section, formula, error handling, invalid-address rejection → Task 1 ✓
- §5 files: client.ts, staking.ts, tools.ts, llm.ts, page.tsx, globals.css, tests/staking.test.ts → all covered. (Additions beyond the spec's file list: `tests/system-prompt.test.ts` — the automated form of §6's "tour mentions wallet/market/governance/staking" check; justified, low-cost.)
- §6 testing: staking integration test ✓, system-prompt/chips browser verification ✓, full suite + typecheck + build ✓
- §7 out of scope respected: no staking transactions, no extra chips, no persistent panel, single network APR estimate only ✓

**Spec correction baked in:** the spec's §4 said rewards come from `fetchDelegatorRewardsNoThrow` as a `{rewards,total}` object; the installed SDK actually returns `ValidatorRewards[]` (one entry per validator). Task 1 Step 4 sums the `inj` coin across the array — this is the correct, verified shape.

**Placeholder scan:** none — every code/edit step contains the full content; every run step has an exact command + expected result.

**Type consistency:** `getStakingData` returns `StakingResult = StakingInfo | StakingError`; the test narrows with `'error' in res`. `StakingInfo.wallet?: StakingWallet { totalStakedInj; validatorCount; pendingRewardsInj }` matches the spec's return shape and the test's assertions. `formatPercent(fraction, sigFigs)` and `formatTokenAmount(rawAmount, decimals)` signatures match `lib/injective/format.ts`. Tool keys (`getStaking`) and exported names (`stakingTool`, `chainMintApi`, `chainStakingApi`, `chainDistributionApi`, `SYSTEM_PROMPT`) are consistent across tasks.
