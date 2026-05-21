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
