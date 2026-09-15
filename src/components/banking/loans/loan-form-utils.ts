/**
 * Percentages follow the same rule as `parseMoneyMinor`: whichever of `,` or `.` comes last is the
 * decimal separator, whatever the interface language. Reading the separators out of the active
 * locale instead looked more correct and was worse — with the interface in English, an Italian
 * typing "3,7" got 37%, silently, in the same dialog where the balance field read the very same
 * keystroke as 3.7. One rule for both fields beats two defensible ones.
 */
export function formatBasisPointsInput(basisPoints: number, locale: string) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(basisPoints / 100);
}

export function parsePercentageToBasisPoints(value: string) {
  let normalized = value.trim().replace(/[\s']/g, '');
  if (!normalized) throw new Error('Invalid percentage');
  if (normalized.startsWith('+')) normalized = normalized.slice(1);
  if (normalized.startsWith('-')) throw new Error('Invalid percentage');

  const decimalIndex = Math.max(normalized.lastIndexOf(','), normalized.lastIndexOf('.'));
  const wholeRaw = decimalIndex === -1 ? normalized : normalized.slice(0, decimalIndex);
  const fraction = decimalIndex === -1 ? '' : normalized.slice(decimalIndex + 1);
  const whole = wholeRaw.replace(/[.,]/g, '') || '0';

  if (!/^\d+$/.test(whole) || (fraction && !/^\d+$/.test(fraction))) {
    throw new Error('Invalid percentage');
  }

  const paddedFraction = fraction.padEnd(3, '0');
  const roundedBasisPoints =
    BigInt(whole) * 100n + BigInt(paddedFraction.slice(0, 2) || '0') + (paddedFraction[2] >= '5' ? 1n : 0n);
  const result = Number(roundedBasisPoints);
  if (!Number.isSafeInteger(result)) throw new Error('Invalid percentage');
  return result;
}
