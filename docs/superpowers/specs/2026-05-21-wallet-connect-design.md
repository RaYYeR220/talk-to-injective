# Wallet Connect (read-only) — Design Spec

**Date:** 2026-05-21
**Feature:** Connect Keplr/Leap to personalize the chat's quick actions with the user's own address.
**Status:** Design approved, ready for implementation plan
**Builds on:** the shipped "Talk to Injective" app (see `2026-05-21-talk-to-injective-design.md`).

## 1. Goal & scope

Let a user connect a wallet so the quick-action chips become **their own** wallet
("What's in my wallet?", "My open positions"). Read-only: we only read the connected
`inj1` address — no signing, no transactions.

**In scope:** wallet connect (Keplr + Leap), connected-state UI, personalized chips.
**Out of scope (explicitly deferred):** budget/cost protection. Wallet connect does NOT
protect the OpenRouter budget (connecting is free and permissionless — anyone can connect
a throwaway wallet and spam). Real protection (rate limiting, spend cap, BYO-key) is a
separate future effort and is intentionally not part of this work.

## 2. Key principle: client-only, zero backend change

The agent already answers "portfolio by address" via the existing `getPortfolio` tool.
Wallet connect only needs to obtain the user's address on the client and inject it into
the chat message text (e.g. the chip sends `What's in inj1…?`). **No changes to
`app/api/chat/route.ts`, `lib/llm.ts`, or any tool.** This keeps the feature contained
and the secret/server surface unchanged.

## 3. Approach (locked): direct wallet globals

Keplr and Leap inject `window.keplr` / `window.leap`. Injective (`injective-1`) is natively
registered in both, so connecting is: `enable('injective-1')` then
`getKey('injective-1').bech32Address`. No `@injectivelabs/wallet-strategy` dependency
(overkill for read-only address from two wallets).

## 4. Components

### `lib/wallet.ts` — pure helpers (unit-testable)
- `INJECTIVE_CHAIN_ID = 'injective-1'`
- `type WalletProvider = 'keplr' | 'leap'`
- `availableWallets(): WalletProvider[]` — which of `window.keplr` / `window.leap` are injected.
- `connectWallet(provider: WalletProvider): Promise<string>` — `enable` then `getKey`,
  returns `bech32Address`. Throws a typed, human-readable error if the wallet isn't
  installed or the user rejects.
- Minimal ambient typing for `window.keplr` / `window.leap` (only `enable`, `getKey`).

### `lib/useWallet.ts` — React state hook
- State: `address: string | null`, `available: WalletProvider[]`, `connecting: boolean`, `error: string | null`.
- `connect(provider)`, `disconnect()`.
- Persists the chosen provider in `localStorage` (`ttinj.wallet`); on mount, if a provider
  was saved and is still injected, silently reconnect (re-derive the address).
- Thin wrapper over `lib/wallet.ts`; holds no business logic beyond state + persistence.

### `app/page.tsx` — consumer
- **Chrome bar:** disconnected → a `Connect` button; connected → an address pill
  `inj1p4…mt3` with a disconnect `✕`, shown alongside the existing `● mainnet` pill.
- **Connect flow:** both wallets injected → a tiny inline chooser (Keplr / Leap);
  exactly one → connect it directly; none → an inline note linking to install Keplr/Leap.
- **Chips:**
  - Disconnected (unchanged): demo-address wallet chip, "How's the INJ perp?", governance.
  - Connected: replace the demo chip with two personalized chips —
    **"What's in my wallet?"** and **"My open positions"** — both compose the connected
    address into the sent text (`What's in ${address}?` / `Show the open positions for ${address}`).
    Keep the market and governance chips.

## 5. Error handling (boundaries only)

- Wallet not installed → friendly inline note ("Keplr/Leap not detected — install to connect").
- User rejects the connection prompt → stay disconnected; surface a brief, non-blocking error.
- `getKey` fails unexpectedly (chain not registered — rare, Injective is built-in) → show
  "couldn't connect"; do not attempt `experimentalSuggestChain` in this scope.
- No `try/catch` noise beyond these boundaries.

## 6. Testing

- **Unit (`lib/wallet.ts`)** with a mocked `window.keplr` / `window.leap`:
  `availableWallets()` reflects which globals exist; `connectWallet` returns the address
  from a stubbed `getKey`; throws when the provider is absent.
- **UI — disconnected state:** verified in a real browser (Connect button + default chips render).
- **UI — connected state:** verified by injecting a stub `window.keplr` (via the browser
  automation's init script) so the pill + the two personalized chips render and a chip
  sends the connected address. This avoids needing a real extension.
- **Honest limitation:** the real handshake with an actual Keplr/Leap extension cannot be
  automated in the headless browser (no extension present). That final "click Connect in a
  real wallet" check is manual (done by the user).

## 7. Files

```
lib/wallet.ts        new — pure connect helpers + ambient window typing
lib/useWallet.ts     new — React hook (state + localStorage persistence)
app/page.tsx         modified — Connect button / address pill / chooser / personalized chips
tests/wallet.test.ts new — unit tests for lib/wallet.ts
```

No other files change. No new runtime dependencies.

## 8. Out of scope (restated)

No budget protection, no signing/auth, no transactions, no MetaMask/EVM, no
`wallet-strategy` dependency, no backend or route changes.
