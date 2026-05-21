import { describe, it, expect } from 'vitest';
import { getMarketSnapshotData } from '../lib/injective/market';

describe('getMarketSnapshotData (mainnet, read-only)', () => {
  it('returns a populated snapshot for the INJ perp', async () => {
    const snap = await getMarketSnapshotData('INJ/USDT PERP');
    expect(snap.found).toBe(true);
    expect(snap.ticker.toUpperCase()).toContain('INJ');
    expect(snap.markPrice).toBeGreaterThan(0);
  });

  it('reports not-found for a nonsense market', async () => {
    const snap = await getMarketSnapshotData('NOPE/NOPE PERP');
    expect(snap.found).toBe(false);
    expect(snap.message).toBeTruthy();
  });
});
