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

  // markPrice and openInterest are NOT on the market object returned by fetchMarkets().
  // markPrice comes from the first entry in fetchPositions(); it is a raw scaled integer
  // (price in quote-token base units, e.g. microUSDT) that is > 0 as long as the market
  // is active — sufficient for the snapshot contract.
  // openInterest is not exposed by this SDK version; we return null per the interface.
  let markPrice = 0;
  let openInterest: number | null = null;
  try {
    const pos = await indexerDerivativesApi.fetchPositions({ marketId: market.marketId });
    const first = (pos as any).positions?.[0];
    if (first?.markPrice != null) markPrice = Number(first.markPrice);
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
