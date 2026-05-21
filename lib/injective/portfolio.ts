import { tool } from 'ai';
import { z } from 'zod';
import { getDefaultSubaccountId } from '@injectivelabs/sdk-ts';
import { chainBankApi, indexerDerivativesApi } from './client';
import { formatTokenAmount, resolveDenom } from './format';

export interface Balance {
  symbol: string;
  amount: number;
}

export interface Position {
  market: string;
  direction: string;
  quantity: number;
  entryPrice: number;
}

export interface Portfolio {
  valid: boolean;
  address: string;
  balances: Balance[];
  positions: Position[];
  message?: string;
}

const isInjAddress = (a: string) => /^inj1[0-9a-z]{38,}$/.test(a);

export async function getPortfolioData(address: string): Promise<Portfolio> {
  if (!isInjAddress(address)) {
    return {
      valid: false,
      address,
      balances: [],
      positions: [],
      message: `"${address}" is not a valid Injective address (they start with "inj1").`,
    };
  }

  try {
    const balancesRes = await chainBankApi.fetchBalances(address);
    const balances: Balance[] = (balancesRes.balances ?? [])
      .map((b: { denom: string; amount: string }) => {
        const { symbol, decimals } = resolveDenom(b.denom);
        return { symbol, amount: formatTokenAmount(b.amount, decimals) };
      })
      .filter((b) => b.amount > 0);

    let positions: Position[] = [];
    try {
      // Build a marketId -> { ticker, quoteDecimals } map for proper entryPrice scaling.
      // The quoteToken.decimals field carries the real decimals (USDT = 6); default to 6.
      const markets = (await indexerDerivativesApi.fetchMarkets()) as any[];
      const marketMap = new Map<string, { ticker: string; quoteDecimals: number }>();
      for (const m of markets) {
        const quoteDecimals = Number(m.quoteToken?.decimals ?? m.quoteDecimals ?? 6);
        marketMap.set(m.marketId, { ticker: m.ticker, quoteDecimals });
      }

      const subaccountId = getDefaultSubaccountId(address);
      const posRes = await indexerDerivativesApi.fetchPositions({ subaccountId });

      // Real SDK fields (confirmed by live inspection):
      //   entryPrice: chain-scaled raw integer string (e.g. "36972000") — divide by 10^quoteDecimals
      //   quantity:   already human-readable decimal string (e.g. "0.001") — no scaling needed
      //   ticker:     present directly on position object, use as market label
      positions = (posRes.positions ?? []).map((p: any) => {
        const info = marketMap.get(p.marketId);
        const quoteDecimals = info?.quoteDecimals ?? 6;
        const ticker = info?.ticker ?? p.ticker ?? p.marketId;
        return {
          market: ticker,
          direction: p.direction,
          // quantity is already a human number (contracts), not chain-scaled
          quantity: Number(p.quantity),
          // entryPrice is a chain-scaled integer; divide by 10^quoteDecimals for USD
          entryPrice: Number(p.entryPrice) / 10 ** quoteDecimals,
        };
      });
    } catch {
      positions = [];
    }

    return { valid: true, address, balances, positions };
  } catch {
    return {
      valid: false,
      address,
      balances: [],
      positions: [],
      message: `Couldn't read "${address}" — double-check it's a valid Injective address.`,
    };
  }
}

export const portfolioTool = tool({
  description:
    'Look up an Injective wallet by address: token balances and open derivative positions. Use for "what is in this wallet?" type questions.',
  inputSchema: z.object({
    address: z
      .string()
      .describe('An Injective bech32 address starting with "inj1".'),
  }),
  execute: async ({ address }) => getPortfolioData(address),
});
