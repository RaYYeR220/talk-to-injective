import { describe, it, expect } from 'vitest';
import { formatTokenAmount, resolveDenom, formatPercent } from '../lib/injective/format';

describe('formatTokenAmount', () => {
  it('converts 18-decimal base units to whole tokens', () => {
    expect(formatTokenAmount('1500000000000000000', 18)).toBeCloseTo(1.5, 6);
  });
  it('converts 6-decimal base units', () => {
    expect(formatTokenAmount('2500000', 6)).toBeCloseTo(2.5, 6);
  });
  it('handles zero', () => {
    expect(formatTokenAmount('0', 18)).toBe(0);
  });
});

describe('resolveDenom', () => {
  it('maps inj to INJ/18', () => {
    expect(resolveDenom('inj')).toEqual({ symbol: 'INJ', decimals: 18 });
  });
  it('maps the peggy USDT denom to USDT/6', () => {
    expect(resolveDenom('peggy0xdAC17F958D2ee523a2206206994597C13D831ec7'))
      .toEqual({ symbol: 'USDT', decimals: 6 });
  });
  it('falls back to a shortened symbol with numeric decimals for unknown denoms', () => {
    const r = resolveDenom('factory/inj1abc/foo');
    expect(r.symbol.length).toBeGreaterThan(0);
    expect(typeof r.decimals).toBe('number');
  });
});

describe('formatPercent', () => {
  it('formats a fraction as a percent string', () => {
    expect(formatPercent(0.00011)).toBe('0.011%');
  });
});
