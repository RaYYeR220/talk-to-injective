'use client';

import { useCallback, useEffect, useState } from 'react';
import { availableWallets, connectWallet, type WalletProvider } from './wallet';

const STORAGE_KEY = 'ttinj.wallet';

export interface WalletState {
  address: string | null;
  available: WalletProvider[];
  connecting: boolean;
  error: string | null;
  connect: (provider: WalletProvider) => Promise<void>;
  disconnect: () => void;
}

export function useWallet(): WalletState {
  const [address, setAddress] = useState<string | null>(null);
  const [available, setAvailable] = useState<WalletProvider[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async (provider: WalletProvider) => {
    setConnecting(true);
    setError(null);
    try {
      const addr = await connectWallet(provider);
      setAddress(addr);
      localStorage.setItem(STORAGE_KEY, provider);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect wallet.');
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setError(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  useEffect(() => {
    setAvailable(availableWallets());
    const saved = localStorage.getItem(STORAGE_KEY) as WalletProvider | null;
    if (saved) {
      // Silent reconnect; if it fails (e.g. wallet removed), forget the saved provider.
      connectWallet(saved)
        .then(setAddress)
        .catch(() => localStorage.removeItem(STORAGE_KEY));
    }
  }, []);

  return { address, available, connecting, error, connect, disconnect };
}
