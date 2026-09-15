import type { Money } from '@/lib/money';
import { currencyFractionDigits, formatMoney } from '@/lib/money';

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

export function formatIsoDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`));
}

export function shortDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
  }).format(new Date(`${value}T00:00:00`));
}

export function formatDateTime(value: string | number | Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
  }).format(new Date(value));
}

export function compactMoney(money: Money, locale: string) {
  const factor = 10 ** currencyFractionDigits(money.currency, locale);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: money.currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(money.amountMinor) / factor);
}

export function formatMoneyList(monies: Array<Money>, locale: string, separator = ', ') {
  return monies.map((money) => formatMoney(money, locale)).join(separator);
}
