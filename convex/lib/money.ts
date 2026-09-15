const DEFAULT_MINOR_UNITS = 2;

const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'JPY',
  'KMF',
  'KRW',
  'MGA',
  'PYG',
  'RWF',
  'UGX',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
]);

export function minorUnitFactor(currency: string): bigint {
  const exponent = ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 0 : DEFAULT_MINOR_UNITS;
  return 10n ** BigInt(exponent);
}

export function decimalNumberToMinorUnits(amount: number, currency: string): bigint {
  const factor = Number(minorUnitFactor(currency));
  return BigInt(Math.round(amount * factor));
}

export function decimalStringToMinorUnits(amount: string, currency: string): bigint {
  const normalized = amount.trim();
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    throw new Error(`Invalid money amount: ${amount}`);
  }

  const sign = normalized.startsWith('-') ? -1n : 1n;
  const unsigned = normalized.replace(/^-/, '');
  const [whole, fraction = ''] = unsigned.split('.');
  const factor = minorUnitFactor(currency);
  const exponent = factor.toString().length - 1;
  const paddedFraction = fraction.padEnd(exponent, '0').slice(0, exponent);
  return sign * (BigInt(whole) * factor + BigInt(paddedFraction || '0'));
}

export function absoluteMinorUnits(amountMinor: bigint): bigint {
  return amountMinor < 0n ? -amountMinor : amountMinor;
}
