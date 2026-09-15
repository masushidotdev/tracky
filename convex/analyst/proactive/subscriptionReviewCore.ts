export type SubscriptionReviewItem = {
  id: string;
  name: string;
  merchantName?: string | null;
  monthlyAmount: number;
  currency: string;
  source: 'manual' | 'detected' | 'transaction';
  latestTransactionDate?: string | null;
};

export type CurrencySubscriptionReview = {
  currency: string;
  monthlyTotal: number;
  annualTotal: number;
  activeCount: number;
  duplicateGroups: Array<{ key: string; label: string; subscriptionIds: Array<string> }>;
  staleSubscriptions: Array<{ id: string; name: string; latestTransactionDate: string }>;
  shareOfIncome?: number;
  actionableCount: number;
  shouldNotify: boolean;
};

export function normalizeSubscriptionName(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function daysBetween(earlierDate: string, laterDate: string) {
  const earlier = Date.parse(`${earlierDate.slice(0, 10)}T00:00:00.000Z`);
  const later = Date.parse(`${laterDate.slice(0, 10)}T00:00:00.000Z`);
  return Number.isFinite(earlier) && Number.isFinite(later) ? Math.floor((later - earlier) / 86_400_000) : 0;
}

export function reviewSubscriptions(
  subscriptions: ReadonlyArray<SubscriptionReviewItem>,
  incomeByCurrency: Readonly<Record<string, number>>,
  asOfDate: string,
): Array<CurrencySubscriptionReview> {
  const byCurrency = new Map<string, Array<SubscriptionReviewItem>>();
  for (const subscription of subscriptions) {
    if (!Number.isFinite(subscription.monthlyAmount) || subscription.monthlyAmount <= 0) continue;
    const currency = subscription.currency.toUpperCase();
    byCurrency.set(currency, [...(byCurrency.get(currency) ?? []), { ...subscription, currency }]);
  }

  return [...byCurrency.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, rows]) => {
      const monthlyTotal = rows.reduce((total, row) => total + row.monthlyAmount, 0);
      const normalizedGroups = new Map<string, Array<SubscriptionReviewItem>>();
      for (const row of rows) {
        const key = normalizeSubscriptionName(row.merchantName || row.name);
        if (key) normalizedGroups.set(key, [...(normalizedGroups.get(key) ?? []), row]);
      }
      const duplicateGroups = [...normalizedGroups.entries()]
        .filter(([, group]) => group.length > 1)
        .map(([key, group]) => ({
          key,
          label: group[0].merchantName || group[0].name,
          subscriptionIds: group.map((row) => row.id).sort(),
        }))
        .sort((left, right) => left.key.localeCompare(right.key));
      const staleSubscriptions = rows
        .filter(
          (row): row is SubscriptionReviewItem & { latestTransactionDate: string } =>
            row.source !== 'manual' &&
            typeof row.latestTransactionDate === 'string' &&
            daysBetween(row.latestTransactionDate, asOfDate) > 90,
        )
        .map((row) => ({ id: row.id, name: row.name, latestTransactionDate: row.latestTransactionDate }))
        .sort((left, right) => left.id.localeCompare(right.id));
      const income = incomeByCurrency[currency];
      const shareOfIncome = Number.isFinite(income) && income > 0 ? (monthlyTotal / income) * 100 : undefined;
      const highLoad = shareOfIncome !== undefined && shareOfIncome > 10;
      const actionableCount = duplicateGroups.length + staleSubscriptions.length + (highLoad ? 1 : 0);
      return {
        currency,
        monthlyTotal,
        annualTotal: monthlyTotal * 12,
        activeCount: rows.length,
        duplicateGroups,
        staleSubscriptions,
        shareOfIncome,
        actionableCount,
        shouldNotify: actionableCount > 0,
      };
    });
}

export function formatSubscriptionReviewSummary(
  reviews: ReadonlyArray<CurrencySubscriptionReview>,
  locale: string,
) {
  const italian = locale.toLowerCase().startsWith('it');
  if (reviews.length === 0) return italian ? 'Nessun abbonamento attivo.' : 'No active subscriptions.';
  return reviews
    .map((review) =>
      italian
        ? `${review.currency}: ${review.activeCount} attivi, ${review.monthlyTotal.toFixed(2)}/mese, ${review.actionableCount} elementi da verificare`
        : `${review.currency}: ${review.activeCount} active, ${review.monthlyTotal.toFixed(2)}/month, ${review.actionableCount} actionable`,
    )
    .join('\n');
}
