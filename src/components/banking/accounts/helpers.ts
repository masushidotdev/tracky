import type { TranslationKey } from '@/lib/i18n';

export function formatConsentExpiry(
  daysUntilExpiry: number | null,
  accessValidUntil: string | undefined,
  translate: (key: TranslationKey, values?: Record<string, string | number>) => string,
) {
  if (!accessValidUntil) {
    return translate('accounts.consent.unknown');
  }

  if (daysUntilExpiry === null) {
    return translate('accounts.consent.validUntil', { date: accessValidUntil });
  }

  if (daysUntilExpiry < 0) {
    return translate('accounts.consent.expired', { days: Math.abs(daysUntilExpiry) });
  }

  if (daysUntilExpiry === 0) {
    return translate('accounts.consent.expiresToday');
  }

  return translate('accounts.consent.expiresIn', { days: daysUntilExpiry });
}
