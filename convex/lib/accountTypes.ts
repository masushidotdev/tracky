export const ASSET_ACCOUNT_TYPES = ['INVS', 'ASST'] as const;

export type AccountGroup = 'cash' | 'credit' | 'loan' | 'asset';

export function normalizeAccountType(accountType?: string | null): string | undefined {
  const normalized = accountType?.trim().toUpperCase();
  return normalized || undefined;
}

export function accountGroupForType(accountType?: string | null): AccountGroup {
  const normalized = normalizeAccountType(accountType);

  if (normalized === 'CARD') return 'credit';
  if (normalized === 'INVS' || normalized === 'ASST') return 'asset';
  return 'cash';
}

export function isAssetAccountType(accountType?: string | null) {
  const normalized = normalizeAccountType(accountType);
  return ASSET_ACCOUNT_TYPES.some((type) => type === normalized);
}

export function isSpendableAccountType(accountType?: string | null) {
  return normalizeAccountType(accountType) !== 'CARD' && !isAssetAccountType(accountType);
}
