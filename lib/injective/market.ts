import { tool } from 'ai';
import { z } from 'zod';
import { indexerDerivativesApi } from './client';
import { formatPercent } from './format';

export interface MarketLite {
  ticker: string;
  marketId: string;
}

const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, ' ');

export function resolveMarket<T extends MarketLite>(query: string, markets: T[]): T | null {
  const q = norm(query);
  const exact = markets.find((m) => norm(m.ticker) === q);
  if (exact) return exact;
  // base-symbol match (e.g. "BTC" -> "BTC/USDT PERP") when exactly one matches
  const base = q.split('/')[0].split(' ')[0];
  const byBase = markets.filter((m) => norm(m.ticker).startsWith(`${base}/`));
  return byBase.length === 1 ? byBase[0] : null;
}

export interface MarketSnapshot {
  ticker: string;
  markPrice: number;
  fundingRate: string | null;
  openInterest: number | null;
  found: boolean;
  message?: string;
}

export async function getMarketSnapshotData(query: string): Promise<MarketSnapshot> {
  // fetchMarkets() returns a bare array in this SDK version.
  const markets = (await indexerDerivativesApi.fetchMarkets()) as any[];
  const market = resolveMarket(query, markets as unknown as MarketLite[]);
  if (!market) {
    return {
      ticker: query,
      markPrice: 0,
      fundingRate: null,
      openInterest: null,
      found: false,
      message: `No derivative market found matching "${query}". Try e.g. "INJ/USDT PERP".`,
    };
  }

  // markPrice / openInterest are not on the fetchMarkets() object in this SDK version.
  // The mark price comes from fetchPositions(); it is a chain-scaled value that must be
  // divided by 10^quoteDecimals to become a human USD price. openInterest is not exposed
  // by this SDK version, so it stays null per the interface.
  const quoteDecimals = Number(
    (market as any).quoteToken?.decimals ?? (market as any).quoteDecimals ?? 6,
  );
  let markPrice = 0;
  const openInterest: number | null = null;
  try {
    const pos = await indexerDerivativesApi.fetchPositions({ marketId: market.marketId });
    const raw = (pos as any).positions?.[0]?.markPrice;
    if (raw != null) markPrice = Number(raw) / 10 ** quoteDecimals;
  } catch {
    markPrice = 0;
  }

  let fundingRate: string | null = null;
  try {
    const fr = await indexerDerivativesApi.fetchFundingRates({ marketId: market.marketId });
    const latest = (fr as any).fundingRates?.[0]?.rate;
    if (latest != null) fundingRate = formatPercent(Number(latest));
  } catch {
    fundingRate = null;
  }

  return {
    ticker: market.ticker,
    markPrice,
    fundingRate,
    openInterest,
    found: true,
    // No open positions on a long-tail market means we can't derive a mark price.
    // Flag it so the model doesn't report $0 as a real price.
    ...(markPrice === 0 && {
      message: 'Mark price is currently unavailable for this market.',
    }),
  };
}

export const marketTool = tool({
  description:
    'Get a snapshot of an Injective derivative (perpetual) market: mark price, funding rate and open interest. Use for questions like "how is the INJ perp?" or "what is the funding rate?".',
  inputSchema: z.object({
    market: z
      .string()
      .describe('Market ticker or base symbol, e.g. "INJ/USDT PERP" or "BTC".'),
  }),
  execute: async ({ market }) => getMarketSnapshotData(market),
});
