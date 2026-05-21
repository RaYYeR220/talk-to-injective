# Talk to Injective

A friendly AI chat that explains Injective in plain English using **live mainnet
on-chain data** — wallets, markets, and governance. Read-only: no trading, no
signing, no private keys.

![terminal chat UI](docs/screenshot.png)

## Why
Injective is a trading chain, so most tools assume you already speak the language
(funding rates, perps, subaccounts, governance params). This is the opposite: you
just chat, and it reads the chain and explains what's going on for newcomers.

## How AI is used
A chat agent (Gemini 3.5 Flash via OpenRouter, wired with the Vercel AI SDK) turns
plain questions into the right on-chain read, then explains the result for someone
new to crypto. The model never invents numbers — every figure comes from a tool call,
and the tools return structured data the model summarizes.

Three tools:
- `getPortfolio(address)` — token balances + open derivative positions
- `getMarketSnapshot(market)` — mark price, funding rate, open interest
- `getGovernance(proposalId?)` — active proposals, or one explained in plain English

## How Injective is integrated
All data is read through the official `@injectivelabs/sdk-ts` against mainnet:
- **Bank module** (`ChainGrpcBankApi`) — wallet balances
- **Exchange / derivatives indexer** (`IndexerGrpcDerivativesApi`) — markets, funding, positions
- **Governance module** (`ChainGrpcGovApi`) — proposals

Raw chain values (base units, denoms, chain-scaled prices) are normalized to
human-readable units before they reach the model, which keeps answers accurate.

## Run it
1. `npm install`
2. `cp .env.local.example .env.local` and add an `OPENROUTER_API_KEY` (https://openrouter.ai/keys)
3. `npm run dev` → http://localhost:3000

## Tests
`npm test` — unit tests for the normalization/resolver logic, plus integration tests
that read Injective mainnet (network required; no key needed for those).

## Stack
Next.js (App Router), Vercel AI SDK, OpenRouter (Gemini 3.5 Flash), `@injectivelabs/sdk-ts`.
