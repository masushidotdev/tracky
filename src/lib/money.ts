export type Money = {
  amountMinor: bigint;
  currency: string;
};

export function currencyFractionDigits(currency: string, locale = 'en') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

export function moneyFromMajor(amount: number, currency: string, locale = 'en'): Money {
  const factor = 10 ** currencyFractionDigits(currency, locale);
  return { amountMinor: BigInt(Math.round(amount * factor)), currency };
}

export function moneyInputValue(money: Money, locale = 'en') {
  const digits = currencyFractionDigits(money.currency, locale);
  const factor = 10n ** BigInt(digits);
  const negative = money.amountMinor < 0n;
  const absolute = negative ? -money.amountMinor : money.amountMinor;
  const whole = absolute / factor;

  if (digits === 0) {
    return `${negative ? '-' : ''}${whole}`;
  }

  const fraction = (absolute % factor).toString().padStart(digits, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

export function formatMoney(money: Money, locale = 'en-US') {
  const digits = currencyFractionDigits(money.currency, locale);
  const factor = 10 ** digits;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: money.currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(money.amountMinor) / factor);
}

export function parseMoneyMinor(value: string, currency: string, locale = 'en') {
  const digits = currencyFractionDigits(currency, locale);
  const factor = 10n ** BigInt(digits);
  let normalized = value.trim().replace(/[\s']/g, '');
  if (!normalized) return 0n;

  const negative = normalized.startsWith('-');
  normalized = normalized.replace(/^[+-]/, '');

  const commaIndex = normalized.lastIndexOf(',');
  const dotIndex = normalized.lastIndexOf('.');
  const decimalIndex = Math.max(commaIndex, dotIndex);
  const wholeRaw = decimalIndex === -1 ? normalized : normalized.slice(0, decimalIndex);
  const fractionRaw = decimalIndex === -1 ? '' : normalized.slice(decimalIndex + 1);
  const wholeDigits = wholeRaw.replace(/[.,]/g, '') || '0';

  if (!/^\d+$/.test(wholeDigits) || (fractionRaw && !/^\d+$/.test(fractionRaw))) {
    throw new Error('Invalid money amount');
  }

  const paddedFraction = fractionRaw.padEnd(digits + 1, '0');
  const fraction = digits === 0 ? 0n : BigInt(paddedFraction.slice(0, digits));
  const shouldRound = Number(paddedFraction.at(digits) ?? '0') >= 5;
  const absoluteMinor = BigInt(wholeDigits) * factor + fraction + (shouldRound ? 1n : 0n);

  return negative ? -absoluteMinor : absoluteMinor;
}

export function fundedProgressPercent(spent: Money, funded: Money) {
  // Spending against nothing funded has no percentage. Falling back to a denominator of one minor
  // unit reported 587,19 € of unfunded spending as 5.871.900%: it is fully over, so say 100.
  if (funded.amountMinor <= 0n) return spent.amountMinor > 0n ? 100 : 0;
  return Math.max(0, Number((spent.amountMinor * 100n) / funded.amountMinor));
}
