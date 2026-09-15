export function enableBankingErrorSummary(status: number, payload: unknown) {
  if (typeof payload === 'object' && payload !== null) {
    const message = 'message' in payload ? String((payload as { message?: unknown }).message) : null;
    const error = 'error' in payload ? String((payload as { error?: unknown }).error) : null;
    const suffix = [error, message].filter(Boolean).join(': ');
    if (suffix) {
      return `Enable Banking API returned ${status}: ${suffix}`;
    }
  }
  return `Enable Banking API returned ${status}`;
}

export function enableBankingOperationalErrorMessage(status: number, payload: unknown) {
  const summary = enableBankingErrorSummary(status, payload);
  const serialized = JSON.stringify(payload).toLowerCase();

  if (serialized.includes('not active')) {
    return `${summary}. The configured Enable Banking application is not active in the Control Panel.`;
  }

  if (
    serialized.includes('not linked') ||
    serialized.includes('linked account') ||
    serialized.includes('restricted') ||
    serialized.includes('not allowed')
  ) {
    return `${summary}. This restricted Enable Banking app can only authorise accounts linked in the Enable Banking Control Panel.`;
  }

  if (serialized.includes('aspsp_rate_limit_exceeded') || status === 429) {
    return `${summary}. The bank provider rate limit was reached; retry after the scheduled backoff.`;
  }

  if (
    serialized.includes('consent_revoked') ||
    serialized.includes('consent_expired') ||
    serialized.includes('session_revoked') ||
    serialized.includes('session_expired') ||
    serialized.includes('authorization_revoked') ||
    serialized.includes('authorization_expired')
  ) {
    return `${summary}. Reconnect the bank account to renew consent.`;
  }

  if (status === 401 || serialized.includes('wrong signature')) {
    return `${summary}. The configured Enable Banking app id and private key do not match.`;
  }

  return summary;
}
