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
