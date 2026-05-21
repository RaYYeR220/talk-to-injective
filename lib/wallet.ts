export const INJECTIVE_CHAIN_ID = 'injective-1';

export type WalletProvider = 'keplr' | 'leap';

interface InjectedWallet {
  enable(chainId: string): Promise<void>;
  getKey(chainId: string): Promise<{ bech32Address: string }>;
}

// Keplr and Leap inject these globals in the browser.
type WalletWindow = Window & Partial<Record<WalletProvider, InjectedWallet>>;

function getInjected(provider: WalletProvider): InjectedWallet | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as WalletWindow)[provider];
}

export function availableWallets(): WalletProvider[] {
  return (['keplr', 'leap'] as WalletProvider[]).filter((p) => Boolean(getInjected(p)));
}

const LABEL: Record<WalletProvider, string> = { keplr: 'Keplr', leap: 'Leap' };

export async function connectWallet(provider: WalletProvider): Promise<string> {
  const wallet = getInjected(provider);
  if (!wallet) {
    throw new Error(`${LABEL[provider]} is not installed. Add the browser extension to connect.`);
  }
  // Injective is natively registered in both wallets, so no experimentalSuggestChain.
  await wallet.enable(INJECTIVE_CHAIN_ID);
  const key = await wallet.getKey(INJECTIVE_CHAIN_ID);
  return key.bech32Address;
}
