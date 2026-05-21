import { describe, it, expect } from 'vitest';
import { resolveMarket } from '../lib/injective/market';

const markets = [
  { ticker: 'INJ/USDT PERP', marketId: '0xaaa' },
  { ticker: 'BTC/USDT PERP', marketId: '0xbbb' },
] as any[];

describe('resolveMarket', () => {
  it('matches exact ticker case-insensitively', () => {
    expect(resolveMarket('inj/usdt perp', markets)?.marketId).toBe('0xaaa');
  });
  it('matches ignoring extra spaces', () => {
    expect(resolveMarket('INJ/USDT   PERP', markets)?.marketId).toBe('0xaaa');
  });
  it('matches the base symbol alone when unambiguous', () => {
    expect(resolveMarket('BTC', markets)?.marketId).toBe('0xbbb');
  });
  it('returns null when nothing matches', () => {
    expect(resolveMarket('DOGE', markets)).toBeNull();
  });
});
