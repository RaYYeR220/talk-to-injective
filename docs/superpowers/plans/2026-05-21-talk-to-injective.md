# Talk to Injective — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Next.js web chat where a newcomer asks about Injective in plain English and gets clear answers backed by live mainnet on-chain data (portfolio, market snapshot, governance) — read-only, no trading.

**Architecture:** Next.js App Router. A client chat page (`useChat`) posts to a server route `/api/chat`. The route runs the Vercel AI SDK `streamText` multi-step tool loop with Gemini 3 Flash via OpenRouter. Three tools read Injective mainnet through `@injectivelabs/sdk-ts`; a `format` layer normalizes raw chain data before it reaches the model. Secrets live server-side only.

**Tech Stack:** Next.js, TypeScript, Vercel AI SDK v5 (`ai`, `@ai-sdk/react`), `@openrouter/ai-sdk-provider`, `@injectivelabs/sdk-ts`, `@injectivelabs/networks`, `zod`, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-21-talk-to-injective-design.md`

---

## File structure (created/modified across tasks)

```
app/layout.tsx               root layout (from scaffold; minor edit)
app/page.tsx                 chat UI (useChat, terminal T3 theme)
app/globals.css              terminal theme (ported from terminal-refinements.html .t3)
app/api/chat/route.ts        agent loop (streamText + tools)
lib/llm.ts                   OpenRouter provider, model slug, system prompt
lib/injective/client.ts      SDK API clients against mainnet endpoints
lib/injective/format.ts      pure normalizers (amounts, denoms, funding, usd)
lib/injective/portfolio.ts   getPortfolioData(address) + portfolioTool
lib/injective/market.ts      resolveMarket() + getMarketSnapshotData() + marketTool
lib/injective/governance.ts  getGovernanceData() + governanceTool
lib/injective/tools.ts       aggregates the three tools for the route
tests/format.test.ts
tests/market-resolve.test.ts
tests/portfolio.test.ts
tests/market-snapshot.test.ts
tests/governance.test.ts
.env.local.example
README.md
```

> Refinement vs spec: each domain's data function lives with its tool (files that change together live together); `tools.ts` just aggregates. Data functions are exported separately so they're unit/integration testable without the AI SDK.

> Integration tests hit real Injective mainnet **read** endpoints (safe, no keys, no writes). They assert on shape/invariants, not exact values (balances and prices change). They require network access.

---

## Task 0: Scaffold project + tooling

**Files:**
- Create: whole Next.js app skeleton, `vitest.config.ts`, `.env.local.example`

- [ ] **Step 1: Scaffold Next.js (non-interactive)**

Run in the project root (`injective-sprint/`):
```bash
npx create-next-app@latest . --typescript --app --no-src-dir --no-tailwind --eslint --import-alias "@/*" --use-npm --yes
```
Expected: creates `app/`, `package.json`, `tsconfig.json`, `next.config.*`. If it refuses because the dir is non-empty, scaffold in a temp dir and copy `app/`, `package.json`, `tsconfig.json`, `next.config.*`, `next-env.d.ts`, `.gitignore`, `eslint*` over, preserving existing `BRIEF.md`, `docs/`, `*.html`.

- [ ] **Step 2: Install runtime + dev deps**

```bash
npm install ai @ai-sdk/react @openrouter/ai-sdk-provider @injectivelabs/sdk-ts @injectivelabs/networks zod
npm install -D vitest
```

- [ ] **Step 3: Verify AI SDK v5 surface (build-time confirmation)**

```bash
node -e "const ai=require('ai'); console.log(['streamText','tool','convertToModelMessages','stepCountIs'].map(k=>k+':'+(typeof ai[k])).join(', '))"
```
Expected: all four print `:function`. If `stepCountIs` is missing but `isStepCount` exists, use `isStepCount` everywhere this plan writes `stepCountIs`. If `ai` major version is < 5, run `npm install ai@^5 @ai-sdk/react@^2` and re-check.

- [ ] **Step 4: Create Vitest config**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30000, // network integration tests
  },
});
```

- [ ] **Step 5: Add test script**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest run"
```

- [ ] **Step 6: Create env example**

Create `.env.local.example`:
```bash
# Get a key at https://openrouter.ai/keys
OPENROUTER_API_KEY=sk-or-...
# Optional override; defaults to Injective mainnet
# INJECTIVE_NETWORK=Mainnet
```
Then copy it for local dev: `cp .env.local.example .env.local` and paste a real key into `.env.local`.

- [ ] **Step 7: Confirm dev server boots**

Run: `npm run dev` then open http://localhost:3000 — expect the default Next.js page. Stop the server (Ctrl+C).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app + AI SDK + Injective deps + vitest"
```

---

## Task 1: Normalization layer (`format.ts`)

**Files:**
- Create: `lib/injective/format.ts`
- Test: `tests/format.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/format.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { formatTokenAmount, resolveDenom, formatPercent } from '../lib/injective/format';

describe('formatTokenAmount', () => {
  it('converts 18-decimal base units to whole tokens', () => {
    expect(formatTokenAmount('1500000000000000000', 18)).toBeCloseTo(1.5, 6);
  });
  it('converts 6-decimal base units', () => {
    expect(formatTokenAmount('2500000', 6)).toBeCloseTo(2.5, 6);
  });
  it('handles zero', () => {
    expect(formatTokenAmount('0', 18)).toBe(0);
  });
});

describe('resolveDenom', () => {
  it('maps inj to INJ/18', () => {
    expect(resolveDenom('inj')).toEqual({ symbol: 'INJ', decimals: 18 });
  });
  it('maps the peggy USDT denom to USDT/6', () => {
    expect(resolveDenom('peggy0xdAC17F958D2ee523a2206206994597C13D831ec7'))
      .toEqual({ symbol: 'USDT', decimals: 6 });
  });
  it('falls back to a shortened symbol with numeric decimals for unknown denoms', () => {
    const r = resolveDenom('factory/inj1abc/foo');
    expect(r.symbol.length).toBeGreaterThan(0);
    expect(typeof r.decimals).toBe('number');
  });
});

describe('formatPercent', () => {
  it('formats a fraction as a percent string', () => {
    expect(formatPercent(0.00011)).toBe('0.011%');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/format.test.ts`
Expected: FAIL — cannot find module `../lib/injective/format`.

- [ ] **Step 3: Implement `format.ts`**

Create `lib/injective/format.ts`:
```ts
export interface DenomInfo {
  symbol: string;
  decimals: number;
}

// Minimal registry for the common Injective mainnet denoms. Unknown denoms
// fall back to a shortened label; market data carries its own token metadata.
const DENOM_REGISTRY: Record<string, DenomInfo> = {
  inj: { symbol: 'INJ', decimals: 18 },
  peggy0xdAC17F958D2ee523a2206206994597C13D831ec7: { symbol: 'USDT', decimals: 6 },
  peggy0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48: { symbol: 'USDC', decimals: 6 },
};

export function resolveDenom(denom: string): DenomInfo {
  const known = DENOM_REGISTRY[denom];
  if (known) return known;
  const short = denom.length > 12 ? `${denom.slice(0, 6)}…${denom.slice(-4)}` : denom;
  return { symbol: short, decimals: 18 };
}

export function formatTokenAmount(rawAmount: string, decimals: number): number {
  if (!rawAmount) return 0;
  // Display precision is enough; avoid BigInt math for readability.
  return Number(rawAmount) / 10 ** decimals;
}

export function formatPercent(fraction: number, maxFractionDigits = 3): string {
  const pct = fraction * 100;
  return `${Number(pct.toFixed(maxFractionDigits))}%`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/format.test.ts`
Expected: PASS (4 passing).

- [ ] **Step 5: Commit**

```bash
git add lib/injective/format.ts tests/format.test.ts
git commit -m "feat: add chain-data normalization helpers"
```

---

## Task 2: Injective client init (`client.ts`)

**Files:**
- Create: `lib/injective/client.ts`

- [ ] **Step 1: Implement the client module**

Create `lib/injective/client.ts`:
```ts
import { getNetworkEndpoints, Network } from '@injectivelabs/networks';
import {
  ChainGrpcBankApi,
  ChainGrpcGovApi,
  IndexerGrpcDerivativesApi,
} from '@injectivelabs/sdk-ts';

// Mainnet, read-only. Switch network here only.
const endpoints = getNetworkEndpoints(Network.Mainnet);

export const chainBankApi = new ChainGrpcBankApi(endpoints.grpc);
export const chainGovApi = new ChainGrpcGovApi(endpoints.grpc);
export const indexerDerivativesApi = new IndexerGrpcDerivativesApi(endpoints.indexer);
```

- [ ] **Step 2: Smoke-check the module loads and exposes the APIs**

Run:
```bash
node --input-type=module -e "import('@injectivelabs/networks').then(n=>{const e=n.getNetworkEndpoints(n.Network.Mainnet);console.log('grpc',!!e.grpc,'indexer',!!e.indexer)})"
```
Expected: `grpc true indexer true`. (Confirms `Network.Mainnet` resolves. If it errors, try `Network.MainnetSentry` and update `client.ts`.)

- [ ] **Step 3: Commit**

```bash
git add lib/injective/client.ts
git commit -m "feat: init Injective mainnet API clients (read-only)"
```

---

## Task 3: Market resolver + market snapshot (`market.ts`)

**Files:**
- Create: `lib/injective/market.ts`
- Test: `tests/market-resolve.test.ts`, `tests/market-snapshot.test.ts`

- [ ] **Step 1: Write failing test for the pure resolver**

Create `tests/market-resolve.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { resolveMarket } from '../lib/injective/market';

const markets = [
  { ticker: 'INJ/USDT PERP', marketId: '0xaaa' },
  { ticker: 'BTC/USDT PERP', marketId: '0xbbb' },
] as any[];

describe('resolveMarket', () => {
  it('matches exact ticker case-insensitively', () => {
    expect(resolveMarket('inj/usdt perp', markets)?.marketId).toBe('0xaaa');
  });
  it('matches ignoring extra spaces', () => {
    expect(resolveMarket('INJ/USDT   PERP', markets)?.marketId).toBe('0xaaa');
  });
  it('matches the base symbol alone when unambiguous', () => {
    expect(resolveMarket('BTC', markets)?.marketId).toBe('0xbbb');
  });
  it('returns null when nothing matches', () => {
    expect(resolveMarket('DOGE', markets)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/market-resolve.test.ts`
Expected: FAIL — cannot find module `../lib/injective/market`.

- [ ] **Step 3: Implement resolver + snapshot fetcher**

Create `lib/injective/market.ts`:
```ts
import { tool } from 'ai';
import { z } from 'zod';
import { indexerDerivativesApi } from './client';
import { formatPercent } from './format';

export interface MarketLite {
  ticker: string;
  marketId: string;
}

const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, ' ');

export function resolveMarket<T extends MarketLite>(query: string, markets: T[]): T | null {
  const q = norm(query);
  const exact = markets.find((m) => norm(m.ticker) === q);
  if (exact) return exact;
  // base-symbol match (e.g. "BTC" -> "BTC/USDT PERP") when exactly one matches
  const base = q.split('/')[0].split(' ')[0];
  const byBase = markets.filter((m) => norm(m.ticker).startsWith(`${base}/`));
  return byBase.length === 1 ? byBase[0] : null;
}

export interface MarketSnapshot {
  ticker: string;
  markPrice: number;
  fundingRate: string | null;
  openInterest: number | null;
  found: boolean;
  message?: string;
}

export async function getMarketSnapshotData(query: string): Promise<MarketSnapshot> {
  // fetchMarkets() returns the markets array directly in current SDK versions.
  const markets = (await indexerDerivativesApi.fetchMarkets()) as any[];
  const market = resolveMarket(query, markets as unknown as MarketLite[]);
  if (!market) {
    return {
      ticker: query,
      markPrice: 0,
      fundingRate: null,
      openInterest: null,
      found: false,
      message: `No derivative market found matching "${query}". Try e.g. "INJ/USDT PERP".`,
    };
  }
  const full = markets.find((m) => m.marketId === market.marketId);
  let fundingRate: string | null = null;
  try {
    const fr = await indexerDerivativesApi.fetchFundingRates({ marketId: market.marketId });
    const latest = fr.fundingRates?.[0]?.rate;
    if (latest != null) fundingRate = formatPercent(Number(latest));
  } catch {
    fundingRate = null;
  }
  return {
    ticker: market.ticker,
    markPrice: Number(full?.markPrice ?? full?.oraclePrice ?? 0),
    fundingRate,
    openInterest: full?.openInterest != null ? Number(full.openInterest) : null,
    found: true,
  };
}

export const marketTool = tool({
  description:
    'Get a snapshot of an Injective derivative (perpetual) market: mark price, funding rate and open interest. Use for questions like "how is the INJ perp?" or "what is the funding rate?".',
  inputSchema: z.object({
    market: z
      .string()
      .describe('Market ticker or base symbol, e.g. "INJ/USDT PERP" or "BTC".'),
  }),
  execute: async ({ market }) => getMarketSnapshotData(market),
});
```

> Field names (`markPrice`, `oraclePrice`, `openInterest`, `fundingRates[].rate`) come from the indexer derivatives response. If a field is named differently in the installed SDK version, adjust the reads in `getMarketSnapshotData` only — the tool contract is unchanged. The fallback chain and `?? null` keep it from crashing on a missing field. If `fetchMarkets()` returns `{ markets }` rather than an array in your version, change the one destructuring line.

- [ ] **Step 4: Run resolver test to verify it passes**

Run: `npx vitest run tests/market-resolve.test.ts`
Expected: PASS (4 passing).

- [ ] **Step 5: Write a live integration test for the snapshot**

Create `tests/market-snapshot.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { getMarketSnapshotData } from '../lib/injective/market';

describe('getMarketSnapshotData (mainnet, read-only)', () => {
  it('returns a populated snapshot for the INJ perp', async () => {
    const snap = await getMarketSnapshotData('INJ/USDT PERP');
    expect(snap.found).toBe(true);
    expect(snap.ticker.toUpperCase()).toContain('INJ');
    expect(snap.markPrice).toBeGreaterThan(0);
  });

  it('reports not-found for a nonsense market', async () => {
    const snap = await getMarketSnapshotData('NOPE/NOPE PERP');
    expect(snap.found).toBe(false);
    expect(snap.message).toBeTruthy();
  });
});
```

- [ ] **Step 6: Run the integration test (needs network)**

Run: `npx vitest run tests/market-snapshot.test.ts`
Expected: PASS (2 passing). If the INJ perp ticker differs on mainnet, log `markets.map(m=>m.ticker)` once and use the exact ticker in the test.

- [ ] **Step 7: Commit**

```bash
git add lib/injective/market.ts tests/market-resolve.test.ts tests/market-snapshot.test.ts
git commit -m "feat: add market resolver + snapshot tool"
```

---

## Task 4: Portfolio (`portfolio.ts`)

**Files:**
- Create: `lib/injective/portfolio.ts`
- Test: `tests/portfolio.test.ts`

> **Pick a real demo address now (5 min, one-time):** open https://explorer.injective.network,
> find an account with some INJ and ideally an open derivative position (richer demo),
> and copy its `inj1…` address. You will reuse it in the suggestion chip (Task 8) and as
> `TEST_INJ_ADDRESS` for the live test below. Do **not** ship a made-up address — bech32
> has a checksum, so a fabricated one will fail to read.

- [ ] **Step 1: Write a live integration test (shape assertions)**

Create `tests/portfolio.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { getPortfolioData } from '../lib/injective/portfolio';

// Set TEST_INJ_ADDRESS to any real mainnet address to exercise the live read.
// Grab one in 5s: open https://explorer.injective.network, click any recent
// transfer, copy the inj1… sender. The malformed-address case always runs.
const TEST_ADDR = process.env.TEST_INJ_ADDRESS;

describe('getPortfolioData (mainnet, read-only)', () => {
  it.skipIf(!TEST_ADDR)('returns a valid shape for a real address', async () => {
    const p = await getPortfolioData(TEST_ADDR as string);
    expect(p.valid).toBe(true);
    expect(Array.isArray(p.balances)).toBe(true);
    expect(Array.isArray(p.positions)).toBe(true);
    if (p.balances.length > 0) {
      expect(typeof p.balances[0].symbol).toBe('string');
      expect(typeof p.balances[0].amount).toBe('number');
    }
  });

  it('flags a malformed address as invalid', async () => {
    const p = await getPortfolioData('not-an-address');
    expect(p.valid).toBe(false);
    expect(p.message).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/portfolio.test.ts`
Expected: FAIL — cannot find module `../lib/injective/portfolio`.

- [ ] **Step 3: Implement portfolio fetcher + tool**

Create `lib/injective/portfolio.ts`:
```ts
import { tool } from 'ai';
import { z } from 'zod';
import { getDefaultSubaccountId } from '@injectivelabs/sdk-ts';
import { chainBankApi, indexerDerivativesApi } from './client';
import { formatTokenAmount, resolveDenom } from './format';

export interface Balance {
  symbol: string;
  amount: number;
}
export interface Position {
  market: string;
  direction: string;
  quantity: number;
  entryPrice: number;
}
export interface Portfolio {
  valid: boolean;
  address: string;
  balances: Balance[];
  positions: Position[];
  message?: string;
}

const isInjAddress = (a: string) => /^inj1[0-9a-z]{38,}$/.test(a);

export async function getPortfolioData(address: string): Promise<Portfolio> {
  if (!isInjAddress(address)) {
    return {
      valid: false,
      address,
      balances: [],
      positions: [],
      message: `"${address}" is not a valid Injective address (they start with "inj1").`,
    };
  }

  try {
    const balancesRes = await chainBankApi.fetchBalances(address);
    const balances: Balance[] = (balancesRes.balances ?? [])
      .map((b: { denom: string; amount: string }) => {
        const { symbol, decimals } = resolveDenom(b.denom);
        return { symbol, amount: formatTokenAmount(b.amount, decimals) };
      })
      .filter((b) => b.amount > 0);

    let positions: Position[] = [];
    try {
      const subaccountId = getDefaultSubaccountId(address);
      const posRes = await indexerDerivativesApi.fetchPositions({ subaccountId });
      positions = (posRes.positions ?? []).map((p: any) => ({
        market: p.ticker ?? p.marketId,
        direction: p.direction,
        quantity: Number(p.quantity),
        entryPrice: Number(p.entryPrice),
      }));
    } catch {
      positions = [];
    }

    return { valid: true, address, balances, positions };
  } catch {
    return {
      valid: false,
      address,
      balances: [],
      positions: [],
      message: `Couldn't read "${address}" — double-check it's a valid Injective address.`,
    };
  }
}

export const portfolioTool = tool({
  description:
    'Look up an Injective wallet by address: token balances and open derivative positions. Use for "what is in this wallet?" type questions.',
  inputSchema: z.object({
    address: z.string().describe('An Injective bech32 address starting with "inj1".'),
  }),
  execute: async ({ address }) => getPortfolioData(address),
});
```

> The positions read is wrapped in try/catch because an address with no trading subaccount returns an error rather than an empty list in some SDK versions; an empty positions array is the correct plain-English answer ("no open positions"). If `fetchPositions` field names differ, adjust the `.map` only.

- [ ] **Step 4: Run to verify it passes (needs network)**

Run: `npx vitest run tests/portfolio.test.ts`
Expected: PASS (2 passing). If `KNOWN_ADDRESS` returns empty balances, that's fine — the shape assertions still hold; optionally swap in any address you know holds INJ.

- [ ] **Step 5: Commit**

```bash
git add lib/injective/portfolio.ts tests/portfolio.test.ts
git commit -m "feat: add portfolio lookup tool"
```

---

## Task 5: Governance (`governance.ts`)

**Files:**
- Create: `lib/injective/governance.ts`
- Test: `tests/governance.test.ts`

- [ ] **Step 1: Write a live integration test**

Create `tests/governance.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { getGovernanceData } from '../lib/injective/governance';

describe('getGovernanceData (mainnet, read-only)', () => {
  it('lists proposals when no id is given', async () => {
    const res = await getGovernanceData();
    if (res.kind !== 'list') throw new Error('expected a list result');
    expect(res.proposals.length).toBeGreaterThan(0);
    expect(typeof res.proposals[0].id).toBe('number');
    expect(typeof res.proposals[0].title).toBe('string');
  });

  it('returns a single proposal by id', async () => {
    const list = await getGovernanceData();
    if (list.kind !== 'list') throw new Error('expected a list result');
    const id = list.proposals[0].id;
    const one = await getGovernanceData(id);
    if (one.kind !== 'one') throw new Error('expected a single result');
    expect(one.proposal?.id).toBe(id);
    expect(one.proposal?.title?.length ?? 0).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/governance.test.ts`
Expected: FAIL — cannot find module `../lib/injective/governance`.

- [ ] **Step 3: Implement governance fetcher + tool**

Create `lib/injective/governance.ts`:
```ts
import { tool } from 'ai';
import { z } from 'zod';
import { chainGovApi } from './client';

// Cosmos gov proposal status (numeric to stay robust across SDK enum churn):
// 2 = voting period (active), 3 = passed.
const STATUS_VOTING_PERIOD = 2;
const STATUS_PASSED = 3;

export interface ProposalLite {
  id: number;
  title: string;
  status: string;
}
export interface ProposalFull extends ProposalLite {
  summary: string;
  endTime?: string;
}
export interface GovList {
  kind: 'list';
  proposals: ProposalLite[];
}
export interface GovOne {
  kind: 'one';
  proposal: ProposalFull | null;
  message?: string;
}

function readTitle(p: any): string {
  return p?.title ?? p?.content?.title ?? `Proposal #${p?.proposalId ?? p?.id}`;
}
function readSummary(p: any): string {
  return p?.summary ?? p?.content?.description ?? p?.description ?? '';
}

async function fetchByStatus(status: number): Promise<ProposalLite[]> {
  const res = await chainGovApi.fetchProposals({ status: status as any });
  return (res.proposals ?? []).map((p: any) => ({
    id: Number(p.proposalId ?? p.id),
    title: readTitle(p),
    status: String(p.status),
  }));
}

export async function getGovernanceData(proposalId?: number): Promise<GovList | GovOne> {
  if (proposalId == null) {
    // Prefer active (voting-period) proposals; if none are live, fall back to
    // the most recent passed ones so the list (and the demo) always has content.
    let proposals = await fetchByStatus(STATUS_VOTING_PERIOD);
    if (proposals.length === 0) {
      proposals = (await fetchByStatus(STATUS_PASSED)).sort((a, b) => b.id - a.id).slice(0, 10);
    }
    return { kind: 'list', proposals };
  }

  try {
    const p: any = await chainGovApi.fetchProposal(proposalId);
    return {
      kind: 'one',
      proposal: {
        id: Number(p.proposalId ?? p.id ?? proposalId),
        title: readTitle(p),
        status: String(p.status),
        summary: readSummary(p),
        endTime: p.votingEndTime ?? p.endTime,
      },
    };
  } catch {
    return { kind: 'one', proposal: null, message: `No proposal #${proposalId} found.` };
  }
}

export const governanceTool = tool({
  description:
    'Read Injective governance. With no id, lists active (voting-period) proposals, or the most recent passed ones if none are currently live. With an id, returns that proposal so you can explain it in plain English. Use for "what proposals are live?" or "explain proposal #482".',
  inputSchema: z.object({
    proposalId: z
      .number()
      .optional()
      .describe('Proposal number to fetch; omit to list active proposals.'),
  }),
  execute: async ({ proposalId }) => getGovernanceData(proposalId),
});
```

> The list path already falls back from active → recent passed, so it is populated even when nothing is in voting period. Field readers (`readTitle`/`readSummary`) cover the common shapes across SDK versions.

- [ ] **Step 4: Run to verify it passes (needs network)**

Run: `npx vitest run tests/governance.test.ts`
Expected: PASS (2 passing).

- [ ] **Step 5: Commit**

```bash
git add lib/injective/governance.ts tests/governance.test.ts
git commit -m "feat: add governance read tool"
```

---

## Task 6: Aggregate tools + LLM module

**Files:**
- Create: `lib/injective/tools.ts`, `lib/llm.ts`

- [ ] **Step 1: Aggregate the tools**

Create `lib/injective/tools.ts`:
```ts
import { portfolioTool } from './portfolio';
import { marketTool } from './market';
import { governanceTool } from './governance';

export const injectiveTools = {
  getPortfolio: portfolioTool,
  getMarketSnapshot: marketTool,
  getGovernance: governanceTool,
};
```

- [ ] **Step 2: Create the LLM module**

Create `lib/llm.ts`:
```ts
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

// Verify the exact slug at https://openrouter.ai/models (search "Gemini Flash").
// Swapping models = change this one line (e.g. 'anthropic/claude-haiku-4.5').
export const MODEL_SLUG = 'google/gemini-3-flash';

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
export const model = openrouter(MODEL_SLUG);

export const SYSTEM_PROMPT = `You are "Talk to Injective", a friendly guide that helps newcomers understand the Injective blockchain in plain English.

Rules:
- You ONLY read on-chain data via your tools. You never trade, never give financial advice, never tell anyone to buy or sell.
- When a question needs live data (a wallet, a market, governance), call the matching tool. Never invent numbers, prices, or balances.
- Explain like the user is new to crypto: define jargon briefly (e.g. what funding rate means) and keep answers short and clear.
- If a tool reports not-found or invalid input, say so plainly and suggest what to try instead.
- Addresses start with "inj1". If the user gives one, use it directly.`;
```

- [ ] **Step 3: Type-check both modules**

Run: `npx tsc --noEmit`
Expected: no errors. (If `createOpenRouter` is not exported in the installed provider version, use `import { openrouter } from '@openrouter/ai-sdk-provider'` and `export const model = openrouter(MODEL_SLUG)`, relying on `OPENROUTER_API_KEY` from env.)

- [ ] **Step 4: Commit**

```bash
git add lib/injective/tools.ts lib/llm.ts
git commit -m "feat: aggregate tools + OpenRouter LLM module"
```

---

## Task 7: Chat route handler

**Files:**
- Create: `app/api/chat/route.ts`

- [ ] **Step 1: Implement the route**

Create `app/api/chat/route.ts`:
```ts
import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from 'ai';
import { model, SYSTEM_PROMPT } from '@/lib/llm';
import { injectiveTools } from '@/lib/injective/tools';

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model,
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(6),
    tools: injectiveTools,
  });

  return result.toUIMessageStreamResponse();
}
```

- [ ] **Step 2: Manual smoke test against the running server**

Ensure `.env.local` has a real `OPENROUTER_API_KEY`. Run `npm run dev`, then in a second terminal:
```bash
curl -N http://localhost:3000/api/chat -H "Content-Type: application/json" -d "{\"messages\":[{\"id\":\"1\",\"role\":\"user\",\"parts\":[{\"type\":\"text\",\"text\":\"How is the INJ perp doing?\"}]}]}"
```
Expected: a streaming response that ends with a plain-English answer mentioning a price/funding. If you get a 500, read the dev-server console: a bad model slug or missing key are the usual causes. Stop the server.

- [ ] **Step 3: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "feat: add /api/chat agent route"
```

---

## Task 8: Chat UI (`page.tsx`)

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Implement the chat page**

Replace `app/page.tsx` with:
```tsx
'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState } from 'react';

// Replace the inj1… below with the real demo address you picked in Task 4.
const DEMO_ADDRESS = 'inj1...';
const SUGGESTIONS = [
  `What's in ${DEMO_ADDRESS}?`,
  "How's the INJ perp?",
  'What governance proposals are live?',
];

export default function Home() {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
  });

  const busy = status === 'submitted' || status === 'streaming';

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    sendMessage({ text: t });
    setInput('');
  };

  const textOf = (m: (typeof messages)[number]) =>
    m.parts.filter((p) => p.type === 'text').map((p: any) => p.text).join('');
  const usedTool = (m: (typeof messages)[number]) =>
    m.parts.some((p) => p.type.startsWith('tool-') || p.type === 'dynamic-tool');

  return (
    <main className="term">
      <div className="chrome">
        <span className="tl"><i /><i /><i /></span>
        <span className="title">talk-to-injective</span>
        <span className="net">● mainnet</span>
      </div>

      <div className="scroll">
        {messages.length === 0 && (
          <p className="welcome">
            Hey 👋 I read live Injective data for you. Ask me about any{' '}
            <b>wallet</b>, <b>market</b>, or <b>governance proposal</b> — I&apos;ll
            explain it in plain English. I never trade, just read.
          </p>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`line ${m.role === 'user' ? 'u' : 'b'}`}>
            {m.role === 'assistant' && usedTool(m) && !textOf(m) && (
              <span className="reading">reading chain…</span>
            )}
            {textOf(m)}
          </div>
        ))}

        {busy && <div className="line b reading">reading chain…</div>}
      </div>

      <div className="chips">
        {SUGGESTIONS.map((s) => (
          <button key={s} className="chip" onClick={() => send(s)} disabled={busy}>
            › {s}
          </button>
        ))}
      </div>

      <form
        className="promptbar"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <span className="ps">›</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything about Injective…"
          autoFocus
        />
        <button type="submit" className="send" disabled={busy}>
          Send
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors. (If `useChat` in the installed `@ai-sdk/react` does not return `sendMessage`/`status` or messages lack `parts`, check the version's docs — v5 uses `sendMessage({text})` + `message.parts`; older v4 used `handleSubmit`/`message.content`. Adjust the few call sites accordingly.)

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add terminal chat UI"
```

---

## Task 9: Terminal theme (T3) + layout

**Files:**
- Modify: `app/globals.css`, `app/layout.tsx`

- [ ] **Step 1: Replace global CSS with the T3 terminal theme**

Replace `app/globals.css` with (ported from `terminal-refinements.html` `.t3`):
```css
:root { color-scheme: dark; }
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: #0a0e14; }
body {
  font-family: ui-monospace, "SF Mono", "JetBrains Mono", "Cascadia Code", Menlo, Consolas, monospace;
  color: #cdd6e2;
}

.term {
  max-width: 860px; margin: 0 auto; height: 100vh;
  display: flex; flex-direction: column; font-size: 14px; line-height: 1.6;
}
.chrome { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid #18202c; background: #0c121a; }
.chrome .tl { display: flex; gap: 6px; }
.chrome .tl i { width: 11px; height: 11px; border-radius: 50%; display: block; }
.chrome .tl i:nth-child(1) { background: #36d6e7; }
.chrome .tl i:nth-child(2) { background: #5b86ff; }
.chrome .tl i:nth-child(3) { background: #7c5bff; }
.chrome .title { margin-left: 8px; font-size: 12px; color: #8aa0bd; }
.chrome .net { margin-left: auto; font-size: 11px; padding: 3px 9px; border-radius: 4px; background: #0e2a30; color: #4fe0ef; border: 1px solid #1d4d56; }

.scroll { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.welcome {
  background: linear-gradient(180deg, #0e1622, #0a0e14); border: 1px solid #18242f;
  border-radius: 8px; padding: 12px 14px; color: #aebfd2;
  font-family: -apple-system, "Segoe UI", Roboto, sans-serif; font-size: 13px; line-height: 1.55; margin: 0;
}
.welcome b { color: #eaf2ff; }

.line { white-space: pre-wrap; word-break: break-word; }
.line.u { color: #6fe3ff; }
.line.u::before { content: "› "; color: #36d6e7; font-weight: 700; }
.line.b { color: #cdd6e2; }
.reading { color: #5e7390; font-style: italic; }

.chips { display: flex; gap: 8px; flex-wrap: wrap; padding: 8px 16px; }
.chip {
  font-size: 12px; padding: 7px 11px; border-radius: 4px; cursor: pointer;
  border: 1px solid #1d4d56; color: #6ce6f5; background: #0c1c22;
  font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
}
.chip:disabled { opacity: 0.5; cursor: default; }

.promptbar { display: flex; align-items: center; gap: 8px; margin: 6px 16px 16px; padding: 10px 13px; border-radius: 6px; border: 1px solid #213040; background: #0c121a; }
.promptbar .ps { color: #36d6e7; font-weight: 700; }
.promptbar input { flex: 1; background: transparent; border: none; outline: none; color: #cdd6e2; font: inherit; }
.promptbar input::placeholder { color: #5e7390; }
.promptbar .send { font-size: 12px; font-weight: 700; padding: 6px 14px; border: none; border-radius: 6px; background: #36d6e7; color: #08191c; cursor: pointer; }
.promptbar .send:disabled { opacity: 0.5; cursor: default; }
```

- [ ] **Step 2: Set the page title in layout**

In `app/layout.tsx`, set the metadata:
```tsx
export const metadata = {
  title: 'Talk to Injective',
  description: 'Ask about Injective in plain English — live on-chain data, no trading.',
};
```
Keep the rest of the generated `layout.tsx` (the `<html><body>{children}</body></html>` wrapper) and ensure it imports `./globals.css`.

- [ ] **Step 3: Visual verification in the browser**

Run `npm run dev`, open http://localhost:3000. Confirm:
- terminal theme (slate-black + cyan), lean welcome line, three suggestion chips.
- Click "How's the INJ perp?" → "reading chain…" appears, then a plain-English answer with a price/funding.
- Paste the sample address → balances summarized.
- Ask "what governance proposals are live?" → a short list.
Stop the server.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "feat: terminal (T3) theme + page metadata"
```

---

## Task 10: README + submission assets

**Files:**
- Create/modify: `README.md`

- [ ] **Step 1: Write the README**

Create `README.md`:
```markdown
# Talk to Injective

A friendly AI chat that explains Injective in plain English using **live mainnet
on-chain data** — wallets, markets, and governance. Read-only: no trading, no
signing, no private keys.

## How AI is used
A chat agent (Gemini 3 Flash via OpenRouter, wired with the Vercel AI SDK) turns
plain questions into the right on-chain read, then explains the result for someone
new to crypto. The model never invents numbers — every figure comes from a tool call.

## How Injective is integrated
All data is read through the official `@injectivelabs/sdk-ts`:
- **Bank module** (`ChainGrpcBankApi`) — wallet balances
- **Exchange/derivatives indexer** (`IndexerGrpcDerivativesApi`) — market price, funding, open interest, positions
- **Governance module** (`ChainGrpcGovApi`) — active proposals and details

## Run it
1. `npm install`
2. `cp .env.local.example .env.local` and add an `OPENROUTER_API_KEY` (https://openrouter.ai/keys)
3. `npm run dev` → http://localhost:3000

## Tests
`npm test` (integration tests read Injective mainnet; network required).

## Stack
Next.js, Vercel AI SDK, OpenRouter (Gemini 3 Flash), @injectivelabs/sdk-ts.
```

- [ ] **Step 2: Final full test + typecheck pass**

Run: `npm test && npx tsc --noEmit`
Expected: all tests pass, no type errors.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README (AI usage + Injective integration)"
```

- [ ] **Step 4: Demo video checklist (manual, not code)**

Record a < 2 min screen capture of one journey: open app → click a suggestion → ask the market question → paste an address → ask to explain a live proposal. Keep answers visible. This + the repo + a deployed/demo link go into the HackQuest Typeform.

---

## Self-review notes (for the implementer)

- **Versions are the main risk.** Task 0 Step 3 and the inline notes in Tasks 6–8 pin the AI SDK v5 surface; if `npm` installs a different major, follow the fallback notes.
- **SDK field names** (market price/funding/positions/proposal title) can vary by SDK version. Each fetcher isolates the raw reads and uses fallback chains, so a mismatch is a one-line fix inside one function — the tool contracts and tests stay stable.
- **Network-dependent tests** are intentional (they prove the SDK integration really works). If you need offline/CI runs later, swap them for mocked SDK responses behind the same function signatures.
```
