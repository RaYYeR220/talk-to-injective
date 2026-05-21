'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState } from 'react';

// A real, funded mainnet address (holds INJ + USDT and an open position) for the demo chip.
const DEMO_ADDRESS = 'inj1p4qgrapyuxrurm0jyux9s2q8fn4ghsxwy24mt3';
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

        {busy && messages[messages.length - 1]?.role === 'user' && (
          <div className="line b reading">reading chain…</div>
        )}
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
