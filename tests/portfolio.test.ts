import { describe, it, expect, beforeAll } from 'vitest';
import { getInjectiveAddress } from '@injectivelabs/sdk-ts';
import { indexerDerivativesApi } from '../lib/injective/client';
import { getPortfolioData } from '../lib/injective/portfolio';

let realAddress: string | null = null;
beforeAll(async () => {
  // Find a real trader: take an open position on any market, derive its owner address.
  const markets = (await indexerDerivativesApi.fetchMarkets()) as any[];
  const inj = markets.find((m) => /INJ\/USDT/i.test(m.ticker));
  const pos = await indexerDerivativesApi.fetchPositions({ marketId: inj.marketId });
  const subaccountId = (pos as any).positions?.[0]?.subaccountId as string | undefined;
  if (subaccountId) realAddress = getInjectiveAddress(subaccountId.slice(0, 42));
}, 30000);

describe('getPortfolioData (mainnet, read-only)', () => {
  it('returns a valid shape for a real funded address', async () => {
    if (!realAddress) throw new Error('could not derive a real address from chain');
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
