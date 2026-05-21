# Wallet Connect (read-only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user connect Keplr/Leap (read-only) so the chat's quick-action chips become their own wallet ("What's in my wallet?", "My open positions").

**Architecture:** Client-only. Pure helpers read the injected wallet globals and return the `inj1` address; a React hook holds the connection state and persists it; `page.tsx` shows a Connect button / address pill and personalizes the chips by composing the connected address into the message text. No backend, route, tool, or dependency changes — the existing `getPortfolio` tool already answers "portfolio by address".

**Tech Stack:** Next.js 16 (App Router, client component), React 19, AI SDK `useChat` (existing), Keplr/Leap injected globals, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-21-wallet-connect-design.md`

---

## File structure

```
lib/wallet.ts         new — pure connect helpers + ambient window typing (SSR-safe)
lib/useWallet.ts      new — React hook: state + localStorage persistence
app/page.tsx          modified — Connect button / address pill / chooser / personalized chips
app/globals.css       modified — styles for connect button, address pill, chooser
tests/wallet.test.ts  new — unit tests for lib/wallet.ts (mocked window globals)
```

No new runtime dependencies. No changes to `app/api/chat/route.ts`, `lib/llm.ts`, or any tool.

> Tests run in Vitest's `node` environment (no DOM). `lib/wallet.ts` is written SSR-safe
> (`typeof window` guard) and the test stubs `globalThis.window`, so no jsdom dependency is needed.

---

## Task 1: Wallet helpers (`lib/wallet.ts`)

**Files:**
- Create: `lib/wallet.ts`
- Test: `tests/wallet.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/wallet.test.ts`:
```ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { availableWallets, connectWallet, INJECTIVE_CHAIN_ID } from '../lib/wallet';

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('availableWallets', () => {
  it('returns only the injected providers', () => {
    (globalThis as { window?: unknown }).window = { keplr: {} };
    expect(availableWallets()).toEqual(['keplr']);
  });
  it('returns both when both are injected', () => {
    (globalThis as { window?: unknown }).window = { keplr: {}, leap: {} };
    expect(availableWallets()).toEqual(['keplr', 'leap']);
  });
  it('returns empty when none are injected', () => {
    (globalThis as { window?: unknown }).window = {};
    expect(availableWallets()).toEqual([]);
  });
});

describe('connectWallet', () => {
  it('enables the Injective chain and returns the bech32 address', async () => {
    const enable = vi.fn().mockResolvedValue(undefined);
    const getKey = vi.fn().mockResolvedValue({ bech32Address: 'inj1stub000000000000000000000000000000000' });
    (globalThis as { window?: unknown }).window = { keplr: { enable, getKey } };

    const addr = await connectWallet('keplr');

    expect(addr).toBe('inj1stub000000000000000000000000000000000');
    expect(enable).toHaveBeenCalledWith(INJECTIVE_CHAIN_ID);
    expect(getKey).toHaveBeenCalledWith(INJECTIVE_CHAIN_ID);
  });
  it('throws a helpful error when the wallet is not installed', async () => {
    (globalThis as { window?: unknown }).window = {};
    await expect(connectWallet('leap')).rejects.toThrow(/not installed/i);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/wallet.test.ts`
Expected: FAIL — cannot find module `../lib/wallet`.

- [ ] **Step 3: Implement `lib/wallet.ts`**

Create `lib/wallet.ts`:
```ts
export const INJECTIVE_CHAIN_ID = 'injective-1';

export type WalletProvider = 'keplr' | 'leap';

interface InjectedWallet {
  enable(chainId: string): Promise<void>;
  getKey(chainId: string): Promise<{ bech32Address: string }>;
}

// Keplr and Leap inject these globals in the browser.
type WalletWindow = Window & Partial<Record<WalletProvider, InjectedWallet>>;

function getInjected(provider: WalletProvider): InjectedWallet | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as WalletWindow)[provider];
}

export function availableWallets(): WalletProvider[] {
  return (['keplr', 'leap'] as WalletProvider[]).filter((p) => Boolean(getInjected(p)));
}

const LABEL: Record<WalletProvider, string> = { keplr: 'Keplr', leap: 'Leap' };

export async function connectWallet(provider: WalletProvider): Promise<string> {
  const wallet = getInjected(provider);
  if (!wallet) {
    throw new Error(`${LABEL[provider]} is not installed. Add the browser extension to connect.`);
  }
  // Injective is natively registered in both wallets, so no experimentalSuggestChain.
  await wallet.enable(INJECTIVE_CHAIN_ID);
  const key = await wallet.getKey(INJECTIVE_CHAIN_ID);
  return key.bech32Address;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/wallet.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/wallet.ts tests/wallet.test.ts
git commit -m "feat: add read-only Keplr/Leap connect helpers"
```

---

## Task 2: Wallet state hook (`lib/useWallet.ts`)

**Files:**
- Create: `lib/useWallet.ts`

> Not unit-tested: testing a React hook needs React Testing Library/jsdom (not installed,
> and out of scope). The hook is thin (state + persistence) and is verified through the
> page integration in Task 3's browser check.

- [ ] **Step 1: Implement the hook**

Create `lib/useWallet.ts`:
```ts
'use client';

import { useCallback, useEffect, useState } from 'react';
import { availableWallets, connectWallet, type WalletProvider } from './wallet';

const STORAGE_KEY = 'ttinj.wallet';

export interface WalletState {
  address: string | null;
  available: WalletProvider[];
  connecting: boolean;
  error: string | null;
  connect: (provider: WalletProvider) => Promise<void>;
  disconnect: () => void;
}

export function useWallet(): WalletState {
  const [address, setAddress] = useState<string | null>(null);
  const [available, setAvailable] = useState<WalletProvider[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async (provider: WalletProvider) => {
    setConnecting(true);
    setError(null);
    try {
      const addr = await connectWallet(provider);
      setAddress(addr);
      localStorage.setItem(STORAGE_KEY, provider);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect wallet.');
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setError(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  useEffect(() => {
    setAvailable(availableWallets());
    const saved = localStorage.getItem(STORAGE_KEY) as WalletProvider | null;
    if (saved) {
      // Silent reconnect; if it fails (e.g. wallet removed), forget the saved provider.
      connectWallet(saved)
        .then(setAddress)
        .catch(() => localStorage.removeItem(STORAGE_KEY));
    }
  }, []);

  return { address, available, connecting, error, connect, disconnect };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/useWallet.ts
git commit -m "feat: add useWallet hook with localStorage reconnect"
```

---

## Task 3: Wire wallet into the chat page

**Files:**
- Modify: `app/page.tsx` (full new content below)
- Modify: `app/globals.css` (append wallet styles)

- [ ] **Step 1: Replace `app/page.tsx`**

Replace the entire file with:
```tsx
'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState } from 'react';
import { useWallet } from '@/lib/useWallet';
import type { WalletProvider } from '@/lib/wallet';

// A real, funded mainnet address (holds INJ + USDT and an open position) for the demo chip.
const DEMO_ADDRESS = 'inj1p4qgrapyuxrurm0jyux9s2q8fn4ghsxwy24mt3';

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const WALLET_LABEL: Record<WalletProvider, string> = { keplr: 'Keplr', leap: 'Leap' };

interface Suggestion {
  label: string;
  text: string;
}

function suggestions(address: string | null): Suggestion[] {
  if (address) {
    return [
      { label: "What's in my wallet?", text: `What's in ${address}?` },
      { label: 'My open positions', text: `Show the open derivative positions for ${address}` },
      { label: "How's the INJ perp?", text: "How's the INJ perp?" },
      { label: 'What governance proposals are live?', text: 'What governance proposals are live?' },
    ];
  }
  return [
    { label: `What's in ${short(DEMO_ADDRESS)}?`, text: `What's in ${DEMO_ADDRESS}?` },
    { label: "How's the INJ perp?", text: "How's the INJ perp?" },
    { label: 'What governance proposals are live?', text: 'What governance proposals are live?' },
  ];
}

export default function Home() {
  const [input, setInput] = useState('');
  const [choosing, setChoosing] = useState(false);
  const { address, available, connecting, error, connect, disconnect } = useWallet();
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

  const onConnectClick = () => {
    if (available.length === 1) {
      connect(available[0]);
      return;
    }
    setChoosing(true); // 0 → install note, 2 → chooser
  };

  const pickWallet = (p: WalletProvider) => {
    setChoosing(false);
    connect(p);
  };

  const textOf = (m: (typeof messages)[number]) =>
    m.parts
      .filter((p) => p.type === 'text')
      .map((p) => (p as { text: string }).text)
      .join('');
  const usedTool = (m: (typeof messages)[number]) =>
    m.parts.some((p) => p.type.startsWith('tool-') || p.type === 'dynamic-tool');

  return (
    <main className="term">
      <div className="chrome">
        <span className="tl">
          <i />
          <i />
          <i />
        </span>
        <span className="title">talk-to-injective</span>
        <span className="right">
          <span className="net">● mainnet</span>
          {address ? (
            <span className="wallet">
              {short(address)}
              <button className="x" onClick={disconnect} aria-label="Disconnect wallet">
                ✕
              </button>
            </span>
          ) : choosing ? (
            available.length > 0 ? (
              <span className="chooser">
                {available.map((p) => (
                  <button key={p} className="wbtn" onClick={() => pickWallet(p)}>
                    {WALLET_LABEL[p]}
                  </button>
                ))}
              </span>
            ) : (
              <span className="note">
                No wallet found — install{' '}
                <a href="https://www.keplr.app/" target="_blank" rel="noreferrer">
                  Keplr
                </a>{' '}
                or{' '}
                <a href="https://www.leapwallet.io/" target="_blank" rel="noreferrer">
                  Leap
                </a>
              </span>
            )
          ) : (
            <button className="connect" onClick={onConnectClick} disabled={connecting}>
              {connecting ? 'Connecting…' : 'Connect'}
            </button>
          )}
        </span>
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

        {busy && messages[messages.length - 1]?.role === 'user' && (
          <div className="line b reading">reading chain…</div>
        )}
      </div>

      {error && <div className="walleterr">{error}</div>}

      <div className="chips">
        {suggestions(address).map((s) => (
          <button key={s.label} className="chip" onClick={() => send(s.text)} disabled={busy}>
            › {s.label}
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

- [ ] **Step 2: Append wallet styles to `app/globals.css`**

Add at the end of `app/globals.css`:
```css
.chrome .right { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.chrome .right .net { margin-left: 0; }

.connect {
  font-size: 11px;
  font-weight: 700;
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid #1d4d56;
  background: #0e2a30;
  color: #4fe0ef;
  cursor: pointer;
}
.connect:disabled { opacity: 0.6; cursor: default; }

.wallet {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  padding: 3px 6px 3px 10px;
  border-radius: 999px;
  background: #0e2a30;
  color: #6ce6f5;
  border: 1px solid #1d4d56;
}
.wallet .x {
  border: none;
  background: transparent;
  color: #6ce6f5;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  padding: 0 2px;
}
.wallet .x:hover { color: #fff; }

.chooser { display: inline-flex; gap: 6px; }
.wbtn {
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid #1d4d56;
  background: #0c1c22;
  color: #6ce6f5;
  cursor: pointer;
}
.wbtn:hover { background: #0e2730; }

.chrome .note { font-size: 11px; color: #8aa0bd; font-family: -apple-system, "Segoe UI", Roboto, sans-serif; }
.chrome .note a { color: #4fe0ef; }

.walleterr {
  margin: 0 16px 8px;
  font-size: 12px;
  color: #ff8a8a;
  font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify the disconnected UI in a real browser**

Run `npm run dev`, open http://localhost:3000. Confirm:
- A `Connect` button shows in the chrome bar next to `● mainnet`.
- The three default chips render (demo wallet shortened, INJ perp, governance).
- Clicking `Connect` with no wallet extension shows the "No wallet found — install Keplr or Leap" note.
Stop the server.

- [ ] **Step 5: Verify the connected UI with a stubbed wallet**

Goal: confirm the connected pill + the two personalized chips render, without a real extension.
With the dev server running, inject a stub wallet **before page load** and set the saved
provider, so the hook's silent-reconnect path produces the connected state. Using Playwright:
```js
await page.addInitScript(() => {
  // @ts-expect-error test stub
  window.keplr = {
    enable: async () => {},
    getKey: async () => ({ bech32Address: 'inj1p4qgrapyuxrurm0jyux9s2q8fn4ghsxwy24mt3' }),
  };
  localStorage.setItem('ttinj.wallet', 'keplr');
});
await page.goto('http://localhost:3000');
```
Confirm: the chrome shows the address pill `inj1p4…mt3 ✕`, and the chips are now
"What's in my wallet?" and "My open positions". Click "What's in my wallet?" and confirm the
sent message contains the stub address and a real portfolio answer streams back. Clicking ✕
returns to the `Connect` button.

> If the harness can't inject a script before load, fall back to: rely on Task 1's unit tests
> for the connect logic, verify the disconnected UI (Step 4), and note the connected/real
> handshake as a manual check. State this clearly in the report.

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx app/globals.css
git commit -m "feat: wallet connect UI + personalized quick actions"
```

---

## Task 4: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite + typecheck + production build**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all tests pass (existing 17 + 5 new = 22), no type errors, build succeeds.

- [ ] **Step 2: Manual real-wallet check (human)**

With a real Keplr or Leap extension installed, click `Connect`, approve, and confirm the
address pill appears and "What's in my wallet?" returns your real portfolio. (Cannot be
automated in a headless browser — this is the human sign-off.)

---

## Self-review notes (for the implementer)

- **SSR safety:** `lib/wallet.ts` guards `typeof window`; the hook touches `localStorage`
  only in effects/handlers (client-only). Initial render is deterministic (`address=null`,
  `available=[]`), so there's no hydration mismatch.
- **No backend change:** the connected address flows into the chat purely as message text;
  `getPortfolio` already handles addresses. Do not modify the route or tools.
- **Silent reconnect** calls `enable()` on mount when a provider was saved; on an
  already-approved origin Keplr/Leap do this without a popup. If a popup appears for some
  users, that's acceptable for this scope.
