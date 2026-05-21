import { describe, it, expect, beforeAll } from 'vitest';
import { getInjectiveAddress } from '@injectivelabs/sdk-ts';
import { indexerDerivativesApi } from '../lib/injective/client';
import { getPortfolioData } from '../lib/injective/portfolio';

// A known funded mainnet wallet (real INJ + USDT) — stable fallback so the test
// never fails spuriously when no live position can be derived at run time.
const KNOWN_FUNDED = 'inj1p4qgrapyuxrurm0jyux9s2q8fn4ghsxwy24mt3';

let realAddress: string = KNOWN_FUNDED;
beforeAll(async () => {
  // Prefer a freshly-derived real trader; fall back to the known funded wallet.
  try {
    const markets = (await indexerDerivativesApi.fetchMarkets()) as any[];
    const inj = markets.find((m) => /INJ\/USDT/i.test(m.ticker));
    const pos = await indexerDerivativesApi.fetchPositions({ marketId: inj.marketId });
    const subaccountId = (pos as any).positions?.[0]?.subaccountId as string | undefined;
    if (subaccountId) realAddress = getInjectiveAddress(subaccountId.slice(0, 42));
  } catch {
    // keep the known funded fallback
  }
}, 30000);

describe('getPortfolioData (mainnet, read-only)', () => {
  it('returns a valid shape for a real funded address', async () => {
    const p = await getPortfolioData(realAddress);
    expect(p.valid).toBe(true);
    expect(Array.isArray(p.balances)).toBe(true);
    expect(Array.isArray(p.positions)).toBe(true);
    if (p.positions.length > 0) {
      expect(typeof p.positions[0].direction).toBe('string');
      // entryPrice must be a human price, not a raw chain integer
      expect(p.positions[0].entryPrice).toBeLessThan(1_000_000);
    }
  }, 30000);

  it('flags a malformed address as invalid', async () => {
    const p = await getPortfolioData('not-an-address');
    expect(p.valid).toBe(false);
    expect(p.message).toBeTruthy();
  });
});
