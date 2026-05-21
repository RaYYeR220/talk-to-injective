import { describe, it, expect } from 'vitest';
import { getMarketSnapshotData } from '../lib/injective/market';

describe('getMarketSnapshotData (mainnet, read-only)', () => {
  it('returns a populated snapshot for the INJ perp', async () => {
    const snap = await getMarketSnapshotData('INJ/USDT PERP');
    expect(snap.found).toBe(true);
    expect(snap.ticker.toUpperCase()).toContain('INJ');
    // Scaled to a real human price: not an unscaled chain integer (would be > 1e6),
    // and not absurdly small from wrong decimals (would be < 0.01).
    expect(snap.markPrice).toBeGreaterThan(0.01);
    expect(snap.markPrice).toBeLessThan(100000);
    expect(snap.fundingRate).toMatch(/^-?\d+(\.\d+)?%$/);
    expect(snap.openInterest).toBeNull();
  });

  it('reports not-found for a nonsense market', async () => {
    const snap = await getMarketSnapshotData('NOPE/NOPE PERP');
    expect(snap.found).toBe(false);
    expect(snap.message).toBeTruthy();
  });
});
