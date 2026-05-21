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

  it('carries the two official Injective links (so they can be offered without guessing URLs)', () => {
    expect(SYSTEM_PROMPT).toContain('hub.injective.network');
    expect(SYSTEM_PROMPT).toContain('helixapp.com');
  });

  it('does not tell the model to label terms as "jargon"', () => {
    expect(SYSTEM_PROMPT.toLowerCase()).not.toContain('jargon');
  });
});
