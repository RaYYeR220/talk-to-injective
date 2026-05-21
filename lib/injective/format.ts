export interface DenomInfo {
  symbol: string;
  decimals: number;
}

// Minimal registry for the common Injective mainnet denoms. Unknown denoms
// fall back to a shortened label; market data carries its own token metadata.
const DENOM_REGISTRY: Record<string, DenomInfo> = {
  inj: { symbol: 'INJ', decimals: 18 },
  peggy0xdAC17F958D2ee523a2206206994597C13D831ec7: { symbol: 'USDT', decimals: 6 },
  peggy0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48: { symbol: 'USDC', decimals: 6 },
};

export function resolveDenom(denom: string): DenomInfo {
  const known = DENOM_REGISTRY[denom];
  if (known) return known;
  const short = denom.length > 12 ? `${denom.slice(0, 6)}…${denom.slice(-4)}` : denom;
  return { symbol: short, decimals: 18 };
}

export function formatTokenAmount(rawAmount: string, decimals: number): number {
  if (!rawAmount) return 0;
  // Display precision is enough; avoid BigInt math for readability.
  return Number(rawAmount) / 10 ** decimals;
}

export function formatPercent(fraction: number, maxFractionDigits = 3): string {
  const pct = fraction * 100;
  return `${Number(pct.toFixed(maxFractionDigits))}%`;
}
