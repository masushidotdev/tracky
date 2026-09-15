export const BALANCE_PRIVACY_COOKIE = 'tracky.balancesHidden';
export const BALANCE_PRIVACY_STORAGE_KEY = 'tracky.balancesHidden';
export const HIDDEN_AMOUNT_PLACEHOLDER = '••••';

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function parseBalancePrivacyValue(value: string | null | undefined) {
  return value === '1';
}

export function serializeBalancePrivacyValue(hidden: boolean) {
  return hidden ? '1' : '0';
}

/**
 * Reads the preference out of a raw cookie header — `document.cookie` on the client, the request
 * header on the server. The value seeds the provider before the first render, so it has to be
 * readable in both places.
 */
export function readBalancePrivacyCookie(cookieHeader: string | null | undefined) {
  if (!cookieHeader) return false;

  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;

    if (part.slice(0, separator).trim() === BALANCE_PRIVACY_COOKIE) {
      return parseBalancePrivacyValue(part.slice(separator + 1).trim());
    }
  }

  return false;
}

export function balancePrivacyCookie(hidden: boolean) {
  return `${BALANCE_PRIVACY_COOKIE}=${serializeBalancePrivacyValue(hidden)}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
}
