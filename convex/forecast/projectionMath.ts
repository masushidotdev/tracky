export const RATE_SCALE_NUMBER = 1_000_000_000_000;
export const RATE_SCALE = BigInt(RATE_SCALE_NUMBER);
export const PERCENT_SCALE_NUMBER = 1_000_000;
export const PERCENT_SCALE = BigInt(PERCENT_SCALE_NUMBER);

export function roundedDivide(value: bigint, divisor: bigint) {
  if (value >= 0n) return (value + divisor / 2n) / divisor;
  return -((-value + divisor / 2n) / divisor);
}

export function multiplyScaled(value: bigint, scaledMultiplier: bigint, scale: bigint) {
  return roundedDivide(value * scaledMultiplier, scale);
}

export function monthlyRateScaled(annualPct: number) {
  const monthlyRate = (1 + annualPct / 100) ** (1 / 12) - 1;
  return BigInt(Math.round(monthlyRate * RATE_SCALE_NUMBER));
}

export function applyMonthlyRate(value: bigint, rateScaled: bigint) {
  return value + multiplyScaled(value, rateScaled, RATE_SCALE);
}

export function percentScaled(value: number) {
  return BigInt(Math.round(value * PERCENT_SCALE_NUMBER));
}

export function amountAtPercent(value: bigint, pct: number) {
  return multiplyScaled(value, percentScaled(pct), 100n * PERCENT_SCALE);
}

export function ratioPct(numerator: bigint, denominator: bigint) {
  if (denominator <= 0n) return numerator >= 0n ? 100 : 0;
  return Number(roundedDivide(numerator * 10_000n, denominator)) / 100;
}

export function monthEndIso(startDate: string, monthIndex: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate.slice(0, 10));
  if (!match) throw new Error('startDate must be an ISO date.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error('startDate must be a valid ISO date.');
  }
  return new Date(Date.UTC(year, month + monthIndex, 0)).toISOString().slice(0, 10);
}
