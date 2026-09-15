export type BankConnectionResultStatus = 'completed' | 'failed';

export type BankConnectionSearch = {
  bankConnectionState?: string;
  bankConnectionStatus?: BankConnectionResultStatus;
};

export function parseBankConnectionSearch(search: Record<string, unknown>): BankConnectionSearch {
  return {
    bankConnectionState: typeof search.bankConnectionState === 'string' ? search.bankConnectionState : undefined,
    bankConnectionStatus:
      search.bankConnectionStatus === 'completed' || search.bankConnectionStatus === 'failed'
        ? search.bankConnectionStatus
        : undefined,
  };
}
