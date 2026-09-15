type ConnectionHealthInput = {
  status: 'pending' | 'active' | 'reauthorizationRequired' | 'paused' | 'error';
  accessValidUntil?: string;
};

const WARNING_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseAccessValidUntilMs(value: string | undefined) {
  if (!value) {
    return null;
  }

  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999Z` : value;
  const timestamp = Date.parse(normalized);
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function buildConnectionHealth(connection: ConnectionHealthInput, asOfMs = Date.now()) {
  const validUntilMs = parseAccessValidUntilMs(connection.accessValidUntil);
  const daysUntilExpiry = validUntilMs === null ? null : Math.ceil((validUntilMs - asOfMs) / DAY_MS);
  const accessExpired = daysUntilExpiry !== null && daysUntilExpiry < 0;
  const requiresReauthorization = connection.status === 'reauthorizationRequired' || accessExpired;
  const warningLevel =
    requiresReauthorization || connection.status === 'error'
      ? 'error'
      : daysUntilExpiry !== null && daysUntilExpiry <= WARNING_DAYS
        ? 'warning'
        : 'ok';

  return {
    accessValidUntilMs: validUntilMs,
    daysUntilExpiry,
    accessExpired,
    requiresReauthorization,
    warningLevel,
  };
}
