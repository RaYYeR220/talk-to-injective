import { describe, it, expect } from 'vitest';
import { getMarketSnapshotData } from '../lib/injective/market';

describe('getMarketSnapshotData (mainnet, read-only)', () => {
  it('returns a populated snapshot for the INJ perp', async () => {
    const snap = await getMarketSnapshotData('INJ/USDT PERP');
    expect(snap.found).toBe(true);
    expect(snap.ticker.toUpperCase()).toContain('INJ');
    expect(snap.markPrice).toBeGreaterThan(0);
    // Guard against an unscaled chain integer: a real INJ price is well under $100k.
    expect(snap.markPrice).toBeLessThan(100000);
  });

  it('reports not-found for a nonsense market', async () => {
    const snap = await getMarketSnapshotData('NOPE/NOPE PERP');
    expect(snap.found).toBe(false);
    expect(snap.message).toBeTruthy();
  });
});
