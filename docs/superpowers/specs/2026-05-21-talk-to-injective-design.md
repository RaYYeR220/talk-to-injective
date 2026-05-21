# Talk to Injective — Design Spec

**Date:** 2026-05-21
**Contest:** Injective Solo AI Builder Sprint (HackQuest) — deadline 2026-05-31
**Status:** Design approved, ready for implementation plan

## 1. Goal

A web chat where a newcomer asks about Injective in plain English and gets clear,
human answers backed by **live mainnet on-chain data**. Read-only — no trading,
no transactions, no private keys. The pitch is *clarity for newcomers*, which is
the deliberate counter-position to the field (most submissions will be trading bots).

## 2. Why this wins the judging criteria

Judged on: usefulness & clarity, execution quality, **simplicity & accessibility**,
code structure & docs, future contribution potential.

- **Useful + clear + accessible** — plain-English answers to real questions a
  newcomer actually has ("what's in this wallet?", "what's funding?", "what does
  this proposal do?"). Accessibility lives in the *copy and flow*, not the skin.
- **Execution quality** — one tight, polished, distinctive UI beats a sprawling bot.
- **Code structure & docs** — clean module boundaries (below) + a README that
  explains AI usage and Injective integration.
- **Injective integration** — read real chain data through the official
  `@injectivelabs/sdk-ts` across multiple modules (exchange, bank, gov). No agent
  framework needed; using the official SDK *is* the integration.

## 3. Stack (locked)

- **Frontend:** Next.js (App Router), single chat page using the Vercel AI SDK
  `useChat` hook (streaming out of the box).
- **Agent loop:** Vercel AI SDK (`ai` package) `streamText` with multi-step tool
  calling. Runs **server-side** in a route handler.
- **LLM:** Gemini 3 Flash via **OpenRouter** (`@openrouter/ai-sdk-provider`,
  OpenAI-compatible). Cheap + fast + good tool-use; provider swap = one model-slug
  change. Key held server-side only (`OPENROUTER_API_KEY`).
- **Chain data:** `@injectivelabs/sdk-ts` + `@injectivelabs/networks`, **mainnet**,
  read-only. Runs server-side (Node) to avoid browser bundling pain.

## 4. Architecture & data flow

```
Browser (chat UI, useChat)
   │  user message + history
   ▼
/api/chat  (Next.js route handler, server-only secrets)
   │  streamText({ model: openrouter('google/gemini-3-flash'), tools, ... })
   ▼
Gemini 3 Flash  ──picks a tool──▶  tool.execute() runs server-side
                                        │ @injectivelabs/sdk-ts read query (mainnet)
                                        ▼
                                   raw chain data ──▶ format.ts (normalize)
   ◀──normalized JSON back to model──────┘
   │  model writes plain-English answer
   ▼
streamed tokens ──▶ browser renders live
```

The AI SDK runs the loop (model → tool call → tool result → model → final text)
automatically via its multi-step setting.

## 5. Scope — three tools

1. **`getPortfolio(address)`** — bank balances (`chainBankApi.fetchBalances`) +
   open derivative positions (`indexerDerivativesApi.fetchPositions` via
   `getDefaultSubaccountId(address)`). Returns normalized holdings + positions.
2. **`getMarketSnapshot(market)`** — resolves a human ticker ("INJ/USDT PERP") to a
   marketId, then price / funding rate / open interest / 24h volume
   (`indexerDerivativesApi.fetchMarkets` + `fetchFundingRates`). Primary target is
   **derivative (perp) markets** since funding rate is the headline insight; spot
   markets are included only if the same code path supports them trivially.
3. **`getGovernance(proposalId?)`** — list active proposals, or fetch one
   (title, status, timeline, summary text) for the model to explain in plain English.
   Uses the chain governance API (`ChainGrpcGovApi` — confirm exact method at build).

**Stretch (only if slack):** `getStaking(address)` — validators / APR / rewards.
Explicitly out of scope unless time remains.

## 6. Module boundaries (file structure)

```
app/page.tsx              chat UI (useChat)
app/api/chat/route.ts     agent loop (streamText + tools wired in)
lib/injective/client.ts   init SDK API clients against mainnet endpoints
lib/injective/tools.ts    the 3 tool definitions (schema + execute)
lib/injective/format.ts   normalize raw chain data → human-readable
lib/llm.ts                provider + model slug + system prompt
```

Each unit has one job and a clear interface. Swapping the LLM touches only
`lib/llm.ts`; switching network touches only `lib/injective/client.ts`.

## 7. Data normalization (`format.ts`)

Raw Injective data is in base units, denoms, and market IDs. `format.ts` converts
to human-readable values (token symbols, correct decimals, percentages, USD where
available) **before** handing data to the model. This both reduces hallucination
and directly improves answer clarity. Pure functions → easy to unit test.

## 8. LLM layer (`lib/llm.ts`)

- One module owns the provider, model slug, and system prompt.
- System prompt persona: a friendly Injective explainer for newcomers; reads data
  only, never gives trading advice; answers in plain English; says "I don't have
  that" instead of inventing numbers.
- Confirm at build: exact OpenRouter slug for Gemini 3 Flash, and the AI SDK
  version's tool API shape (v4 `parameters`/`maxSteps` vs v5 `inputSchema`/`stopWhen`).

## 9. UI direction (locked)

"Modern terminal" (mockup **T3**): slate-black background + cyan accent (matches
Injective's brand palette), monospace conversation, traffic-light window chrome,
blinking-cursor prompt bar, suggestion chips.

- **Onboarding kept lean** — a single greeting line + the suggestion chips, NOT a
  heavy welcome card (user found the card cluttered). Newcomer still instantly knows
  what to ask.
- Data answers render in a bordered monospace block; prose stays plain-English.

## 10. Error handling (boundaries only)

- Invalid address / unknown market / empty portfolio / no such proposal → the tool
  returns a structured "not found / invalid" result; the model explains it in words.
  No crashes, no white screen.
- Injective endpoint unreachable / timeout → graceful message surfaced to the user.
- Validate only at boundaries (user input, external API responses). Trust internal
  code; no defensive noise.

## 11. Testing

- Unit: `format.ts` normalizers (pure functions).
- Unit: market-ticker → marketId resolver.
- Tools: light integration test against a real mainnet read endpoint using a
  known-stable address/market (read-only, safe), or mocked SDK responses — chosen
  in the plan.
- Manual: chat E2E + a full run of the demo script before recording.

## 12. Deliverables (these are scored)

- **README:** what it is, how AI is used, how Injective is integrated (official SDK,
  exchange/bank/gov modules), how to run it, env vars.
- **Demo video:** one coherent newcomer journey — portfolio by address → "how's
  this market and what's funding?" → "explain this governance proposal."
- Public GitHub repo + demo link (Typeform submission).

## 13. Out of scope

Trading / order placement, wallet signing, transactions, write operations of any
kind. Staking tool is stretch-only. No multi-chain, no auth, no persistence beyond
in-session chat history.
