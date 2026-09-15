import * as React from 'react';

import {
  BALANCE_PRIVACY_STORAGE_KEY,
  HIDDEN_AMOUNT_PLACEHOLDER,
  balancePrivacyCookie,
  parseBalancePrivacyValue,
  serializeBalancePrivacyValue,
} from '@/lib/balance-privacy';

export type BalancePrivacyContextValue = {
  hidden: boolean;
  maskValue: (value: string) => string;
  setHidden: (hidden: boolean) => void;
  toggle: () => void;
};

const BalancePrivacyContext = React.createContext<BalancePrivacyContextValue | null>(null);

export function BalancePrivacyProvider({
  children,
  initialHidden,
}: Readonly<{ children: React.ReactNode; initialHidden: boolean }>) {
  const [hidden, setHiddenState] = React.useState(initialHidden);

  // The cookie decides the first render. localStorage only mirrors it, so it covers the two cases
  // the cookie cannot: a browser that blocks cookies, and a tab that was already open when another
  // tab flipped the switch.
  React.useEffect(() => {
    const stored = window.localStorage.getItem(BALANCE_PRIVACY_STORAGE_KEY);
    if (stored !== null && parseBalancePrivacyValue(stored) !== initialHidden) {
      setHiddenState(parseBalancePrivacyValue(stored));
    }
  }, [initialHidden]);

  React.useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== BALANCE_PRIVACY_STORAGE_KEY) return;
      setHiddenState(parseBalancePrivacyValue(event.newValue));
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const value = React.useMemo<BalancePrivacyContextValue>(() => {
    const setHidden = (next: boolean) => {
      setHiddenState(next);
      document.cookie = balancePrivacyCookie(next);
      window.localStorage.setItem(BALANCE_PRIVACY_STORAGE_KEY, serializeBalancePrivacyValue(next));
    };

    return {
      hidden,
      maskValue: (formatted: string) => (hidden ? HIDDEN_AMOUNT_PLACEHOLDER : formatted),
      setHidden,
      toggle: () => setHidden(!hidden),
    };
  }, [hidden]);

  return <BalancePrivacyContext.Provider value={value}>{children}</BalancePrivacyContext.Provider>;
}

export function useBalancePrivacy() {
  const context = React.useContext(BalancePrivacyContext);
  if (!context) {
    throw new Error('useBalancePrivacy must be used within BalancePrivacyProvider');
  }

  return context;
}
