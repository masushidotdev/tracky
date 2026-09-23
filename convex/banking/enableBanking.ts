'use node';

import { createSign, randomBytes } from 'node:crypto';
import { ConvexError, v } from 'convex/values';
import { action, internalAction } from '../_generated/server';
import { internal } from '../_generated/api';
import { requireAuthUser } from '../auth';
import { buildConnectionHealth } from './connectionHealth';
import { enableBankingErrorSummary, enableBankingOperationalErrorMessage } from './enableBankingErrors';
import { isMissingEnvError } from './providerAvailability';
import { enableBankingSyncWindow } from './syncWindow';
import type { Id } from '../_generated/dataModel';
import type { ActionCtx } from '../_generated/server';

type JsonObject = Record<string, unknown>;
type StartConnectionResult = {
  url: string;
  state: string;
  authRequestId: Id<'providerAuthRequests'>;
};
type AspspOption = {
  id: string;
  name: string;
  country: string;
  bic: string | null;
  logo: string | null;
  beta: boolean;
  psuTypes: Array<string>;
  maximumConsentDays: number | null;
  requiredPsuHeaders: Array<string>;
  services: Array<string>;
};
type ListAspspsResult = {
  aspsps: Array<AspspOption>;
  total: number;
  returned: number;
};
type ProviderDiagnosticResult = {
  ok: boolean;
  status: 'ok' | 'misconfigured' | 'inactive' | 'countryUnsupported' | 'unavailable';
  applicationName: string | null;
  environment: string | null;
  active: boolean | null;
  services: Array<string>;
  country: string;
  applicationCountries: Array<string>;
  aspspCount: number | null;
  checkedAtMs: number;
  message: string | null;
};
type SyncDueAccountsResult = {
  attempted: number;
  succeeded: number;
};
type SyncAccountResult = {
  ok: boolean;
} | null;
type BalanceImportResult = {
  inserted: number;
  seen: number;
};
type TransactionImportResult = {
  imported: number;
  seen: number;
  latestBookedDate: string | null;
};

const TRANSACTION_IMPORT_CHUNK_SIZE = 200;
type ExchangeCallbackResult = {
  status: 'completed' | 'failed';
  reason?: string;
  scheduledSyncs?: number;
};

async function revokeDetachedSession(ctx: ActionCtx, userId: string, sessionId: string): Promise<void> {
  let captured = false;
  try {
    await ctx.runMutation(internal.accountDeletion.captureDetachedConsent, { userId, sessionId });
    captured = true;
  } catch (error) {
    // Still make the immediate attempt if Convex cannot persist the retry.
    console.error('Could not persist detached Enable Banking consent for retry', { code: apiErrorCode(error) });
  }

  try {
    await enableBankingRequest('DELETE', `/sessions/${encodeURIComponent(sessionId)}`);
  } catch (error) {
    if (!(error instanceof EnableBankingApiError && error.status === 404)) {
      console.error('Detached Enable Banking session revocation failed', { code: apiErrorCode(error) });
      return;
    }
  }

  if (captured) {
    try {
      await ctx.runMutation(internal.accountDeletion.markDetachedConsentRevoked, { sessionId });
    } catch (error) {
      // The durable retry will see HTTP 404 if the marker update failed.
      console.error('Could not mark detached Enable Banking consent revoked', { code: apiErrorCode(error) });
    }
  }
}

class EnableBankingApiError extends Error {
  constructor(
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(enableBankingErrorSummary(status, payload));
  }
}

function base64Url(data: Buffer | string) {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return buffer.toString('base64url');
}

function env(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new ConvexError(`Missing Convex environment variable: ${name}`);
  }
  return value;
}

function privateKeyPem() {
  const raw = env('ENABLE_BANKING_PRIVATE_KEY');
  if (raw.includes('BEGIN')) {
    return raw.replace(/\\n/g, '\n');
  }
  return Buffer.from(raw, 'base64').toString('utf8');
}

function enableBankingConfig() {
  return {
    appId: env('ENABLE_BANKING_APP_ID'),
    privateKey: privateKeyPem(),
    apiBase: process.env.ENABLE_BANKING_API_BASE ?? 'https://api.enablebanking.com',
    redirectUrl: env('ENABLE_BANKING_REDIRECT_URL'),
  };
}

function makeJwt(appId: string, privateKey: string, ttlSeconds = 3600) {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    typ: 'JWT',
    alg: 'RS256',
    kid: appId,
  };
  const payload = {
    iss: 'enablebanking.com',
    aud: 'api.enablebanking.com',
    iat: now,
    exp: now + ttlSeconds,
  };
  const signingInput = [base64Url(JSON.stringify(header)), base64Url(JSON.stringify(payload))].join('.');
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  return `${signingInput}.${base64Url(signer.sign(privateKey))}`;
}

export async function enableBankingRequest(
  method: string,
  path: string,
  options: { body?: JsonObject; query?: Record<string, string> } = {},
) {
  const config = enableBankingConfig();
  const url = new URL(path, config.apiBase);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${makeJwt(config.appId, config.privateKey)}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new EnableBankingApiError(response.status, payload);
  }

  return payload;
}

function apiErrorCode(error: unknown) {
  if (!(error instanceof EnableBankingApiError)) {
    return 'UNKNOWN_ERROR';
  }

  if (typeof error.payload === 'object' && error.payload !== null && 'code' in error.payload) {
    return String((error.payload as { code?: unknown }).code);
  }

  const serialized = JSON.stringify(error.payload);
  if (serialized.includes('ASPSP_RATE_LIMIT_EXCEEDED')) {
    return 'ASPSP_RATE_LIMIT_EXCEEDED';
  }

  return `HTTP_${error.status}`;
}

function apiErrorMessage(error: unknown) {
  if (error instanceof EnableBankingApiError) {
    return enableBankingOperationalErrorMessage(error.status, error.payload);
  }

  return error instanceof Error ? error.message : String(error);
}

function providerDiagnosticStatus(error: unknown): ProviderDiagnosticResult['status'] {
  if (!(error instanceof EnableBankingApiError)) {
    return 'unavailable';
  }

  const serialized = JSON.stringify(error.payload).toLowerCase();
  if (error.status === 401 || serialized.includes('wrong signature')) {
    return 'misconfigured';
  }
  if (error.status === 403 || serialized.includes('not active')) {
    return 'inactive';
  }

  return 'unavailable';
}

function requiresReauthorizationError(errorCode: string, error: unknown) {
  if (error instanceof EnableBankingApiError && (error.status === 401 || error.status === 403)) {
    return true;
  }

  const normalized = errorCode.toUpperCase();
  return (
    normalized.includes('CONSENT_REVOKED') ||
    normalized.includes('CONSENT_EXPIRED') ||
    normalized.includes('SESSION_REVOKED') ||
    normalized.includes('SESSION_EXPIRED') ||
    normalized.includes('AUTHORIZATION_REVOKED') ||
    normalized.includes('AUTHORIZATION_EXPIRED')
  );
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function asRecord(value: unknown): JsonObject {
  return typeof value === 'object' && value !== null ? (value as JsonObject) : {};
}

function normalizeAspsp(value: unknown): AspspOption | null {
  const row = asRecord(value);
  const name = typeof row.name === 'string' ? row.name : null;
  const country = typeof row.country === 'string' ? row.country.toUpperCase() : null;

  if (!name || !country) {
    return null;
  }

  const payments = Array.isArray(row.payments) && row.payments.length > 0 ? ['PIS'] : [];
  const maximumConsentValidity =
    typeof row.maximum_consent_validity === 'number' ? row.maximum_consent_validity : null;

  return {
    id: `${country}:${name}`,
    name,
    country,
    bic: typeof row.bic === 'string' ? row.bic : null,
    logo: typeof row.logo === 'string' ? row.logo : null,
    beta: row.beta === true,
    psuTypes: stringArray(row.psu_types),
    maximumConsentDays:
      maximumConsentValidity === null ? null : Math.max(1, Math.floor(maximumConsentValidity / 86400)),
    requiredPsuHeaders: stringArray(row.required_psu_headers),
    services: ['AIS', ...payments],
  };
}

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase();
}

function matchesSearch(aspsp: AspspOption, search: string) {
  if (!search) {
    return true;
  }

  return [aspsp.name, aspsp.country, aspsp.bic ?? ''].some((value) =>
    value.toLocaleLowerCase().includes(search),
  );
}

async function scheduleInitialAccountSyncs(ctx: ActionCtx, providerConnectionId: Id<'providerConnections'>) {
  const syncStates = await ctx.runQuery(internal.banking.providerQueries.listActiveSyncStatesForConnection, {
    providerConnectionId,
    limit: 10,
  });

  for (const [index, syncState] of syncStates.entries()) {
    await ctx.scheduler.runAfter(index * 5000, internal.banking.enableBanking.syncAccount, {
      syncStateId: syncState._id,
      trigger: 'initialCallback',
    });
  }

  return syncStates.length;
}

export const listAspsps = action({
  args: {
    country: v.optional(v.string()),
    psuType: v.optional(v.union(v.literal('personal'), v.literal('business'))),
    service: v.optional(v.union(v.literal('AIS'), v.literal('PIS'))),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ListAspspsResult> => {
    await requireAuthUser(ctx);
    const country = args.country?.trim().toUpperCase();
    let payload: unknown;
    try {
      payload = await enableBankingRequest('GET', '/aspsps', {
        query: {
          service: args.service ?? 'AIS',
          ...(country ? { country } : {}),
          ...(args.psuType ? { psu_type: args.psuType } : {}),
        },
      });
    } catch (error) {
      // Missing server configuration must not leak env var names to the client.
      if (isMissingEnvError(error)) {
        throw new ConvexError('Enable Banking is not configured.');
      }
      throw error;
    }
    const rows = Array.isArray(asRecord(payload).aspsps) ? (asRecord(payload).aspsps as Array<unknown>) : [];
    const search = normalizeSearch(args.search ?? '');
    const limit = Math.min(Math.max(args.limit ?? 30, 1), 100);
    const aspsps = rows
      .map(normalizeAspsp)
      .filter((aspsp): aspsp is AspspOption => aspsp !== null)
      .filter((aspsp) => !country || aspsp.country === country)
      .filter((aspsp) => !args.psuType || aspsp.psuTypes.length === 0 || aspsp.psuTypes.includes(args.psuType))
      .filter((aspsp) => matchesSearch(aspsp, search))
      .sort((left, right) => left.name.localeCompare(right.name) || left.country.localeCompare(right.country));

    return {
      aspsps: aspsps.slice(0, limit),
      total: aspsps.length,
      returned: Math.min(aspsps.length, limit),
    };
  },
});

export const diagnoseConnection = action({
  args: {
    country: v.optional(v.string()),
    psuType: v.optional(v.union(v.literal('personal'), v.literal('business'))),
  },
  handler: async (ctx, args): Promise<ProviderDiagnosticResult> => {
    await requireAuthUser(ctx);
    const checkedAtMs = Date.now();
    const country = args.country?.trim().toUpperCase() || 'IT';
    const psuType = args.psuType ?? 'personal';

    try {
      const application = asRecord(await enableBankingRequest('GET', '/application'));
      const active = typeof application.active === 'boolean' ? application.active : null;
      const services = stringArray(application.services);
      const applicationCountries = stringArray(application.countries).map((value) => value.toUpperCase());
      const countryUnsupported = applicationCountries.length > 0 && !applicationCountries.includes(country);
      const aspspPayload = asRecord(await enableBankingRequest('GET', '/aspsps', {
        query: {
          service: 'AIS',
          country,
          psu_type: psuType,
        },
      }));
      const aspspCount = Array.isArray(aspspPayload.aspsps) ? aspspPayload.aspsps.length : null;

      return {
        ok: active === true && !countryUnsupported && aspspCount !== null,
        status: active === false ? 'inactive' : countryUnsupported ? 'countryUnsupported' : 'ok',
        applicationName: typeof application.name === 'string' ? application.name : null,
        environment: typeof application.environment === 'string' ? application.environment : null,
        active,
        services,
        country,
        applicationCountries,
        aspspCount,
        checkedAtMs,
        message: countryUnsupported
          ? `Enable Banking app is not configured for ${country}. Configured countries: ${applicationCountries.join(', ')}.`
          : null,
      };
    } catch (error) {
      // Missing server configuration is reported as plain unavailable without
      // leaking env var names; the UI shows a generic provider message instead.
      if (isMissingEnvError(error)) {
        return {
          ok: false,
          status: 'unavailable',
          applicationName: null,
          environment: null,
          active: null,
          services: [],
          country,
          applicationCountries: [],
          aspspCount: null,
          checkedAtMs,
          message: null,
        };
      }
      return {
        ok: false,
        status: providerDiagnosticStatus(error),
        applicationName: null,
        environment: null,
        active: null,
        services: [],
        country,
        applicationCountries: [],
        aspspCount: null,
        checkedAtMs,
        message: apiErrorMessage(error),
      };
    }
  },
});

export const startConnection = action({
  args: {
    aspspName: v.string(),
    aspspCountry: v.string(),
    psuType: v.union(v.literal('personal'), v.literal('business')),
    validDays: v.optional(v.number()),
    language: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<StartConnectionResult> => {
    const user = await requireAuthUser(ctx);
    const config = enableBankingConfig();
    const state = randomBytes(24).toString('base64url');
    const validDays = Math.min(Math.max(args.validDays ?? 180, 1), 180);
    const validUntil = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString();
    const authRequestId: Id<'providerAuthRequests'> = await ctx.runMutation(
      internal.banking.providerMutations.createAuthRequest,
      {
        userId: user.id,
        provider: 'enableBanking',
        state,
        redirectUrl: config.redirectUrl,
        aspspName: args.aspspName,
        aspspCountry: args.aspspCountry,
        psuType: args.psuType,
        expiresAtMs: Date.now() + 30 * 60 * 1000,
      },
    );

    try {
      const payload = (await enableBankingRequest('POST', '/auth', {
        body: {
          access: {
            balances: true,
            transactions: true,
            valid_until: validUntil,
          },
          aspsp: {
            name: args.aspspName,
            country: args.aspspCountry,
          },
          state,
          redirect_url: config.redirectUrl,
          psu_type: args.psuType,
          ...(args.language ? { language: args.language } : {}),
        },
      })) as { url?: string; authorization_id?: string; psu_id_hash?: string };

      if (!payload.url) {
        throw new ConvexError('Enable Banking did not return an authorization URL');
      }

      await ctx.runMutation(internal.banking.providerMutations.markAuthRequestRedirected, {
        authRequestId,
        authorizationId: payload.authorization_id,
        providerUserHash: payload.psu_id_hash,
      });

      return {
        url: payload.url,
        state,
        authRequestId,
      };
    } catch (error) {
      await ctx.runMutation(internal.banking.providerMutations.failAuthRequest, {
        state,
        errorCode: apiErrorCode(error),
        errorMessage: apiErrorMessage(error),
      });
      throw error;
    }
  },
});

export const reauthorizeConnection = action({
  args: {
    providerConnectionId: v.id('providerConnections'),
    validDays: v.optional(v.number()),
    language: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<StartConnectionResult> => {
    const user = await requireAuthUser(ctx);
    const connection = await ctx.runQuery(internal.banking.providerQueries.getConnectionForReauthorization, {
      userId: user.id,
      providerConnectionId: args.providerConnectionId,
    });

    if (!connection) {
      throw new ConvexError('Provider connection not found');
    }

    if (!connection.aspspName || !connection.aspspCountry) {
      throw new ConvexError('This bank connection cannot be reauthorized automatically');
    }

    const config = enableBankingConfig();
    const state = randomBytes(24).toString('base64url');
    const validDays = Math.min(Math.max(args.validDays ?? 180, 1), 180);
    const validUntil = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString();
    const authRequestId: Id<'providerAuthRequests'> = await ctx.runMutation(
      internal.banking.providerMutations.createAuthRequest,
      {
        userId: user.id,
        provider: 'enableBanking',
        state,
        redirectUrl: config.redirectUrl,
        aspspName: connection.aspspName,
        aspspCountry: connection.aspspCountry,
        psuType: connection.psuType ?? 'personal',
        providerConnectionId: connection._id,
        expiresAtMs: Date.now() + 30 * 60 * 1000,
      },
    );

    try {
      const payload = (await enableBankingRequest('POST', '/auth', {
        body: {
          access: {
            balances: true,
            transactions: true,
            valid_until: validUntil,
          },
          aspsp: {
            name: connection.aspspName,
            country: connection.aspspCountry,
          },
          state,
          redirect_url: config.redirectUrl,
          psu_type: connection.psuType ?? 'personal',
          ...(args.language ? { language: args.language } : {}),
        },
      })) as { url?: string; authorization_id?: string; psu_id_hash?: string };

      if (!payload.url) {
        throw new ConvexError('Enable Banking did not return an authorization URL');
      }

      await ctx.runMutation(internal.banking.providerMutations.markAuthRequestRedirected, {
        authRequestId,
        authorizationId: payload.authorization_id,
        providerUserHash: payload.psu_id_hash,
      });

      return {
        url: payload.url,
        state,
        authRequestId,
      };
    } catch (error) {
      await ctx.runMutation(internal.banking.providerMutations.failAuthRequest, {
        state,
        errorCode: apiErrorCode(error),
        errorMessage: apiErrorMessage(error),
      });
      throw error;
    }
  },
});

export const exchangeCallback = internalAction({
  args: {
    state: v.string(),
    code: v.optional(v.string()),
    error: v.optional(v.string()),
    errorDescription: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ExchangeCallbackResult> => {
    // Atomically claim the request before any external work. The claim
    // mutation serializes concurrent callbacks: exactly one proceeds to the
    // import job and POST /sessions, the rest get the completed result or a
    // retryable in-progress signal. Single-use authorization codes make this
    // racy window real: without the claim, a loser fails its exchange and
    // its catch path would flip the winner's completed request to failed.
    const claim = await ctx.runMutation(
      internal.banking.providerMutations.claimAuthRequestForCallback,
      {
        state: args.state,
      },
    );

    if (claim.outcome === 'missing') {
      return { status: 'failed', reason: 'UNKNOWN_STATE' };
    }

    // Idempotency: a completed request already produced its connection and
    // scheduled its syncs. Replaying the same state+code (browser retry,
    // double redirect) must not POST /sessions again nor schedule duplicates.
    if (claim.outcome === 'completed') {
      return { status: 'completed', scheduledSyncs: 0 };
    }

    if (claim.outcome === 'processing') {
      return { status: 'failed', reason: 'CALLBACK_IN_PROGRESS' };
    }

    const request = {
      userId: claim.userId,
      providerConnectionId: claim.providerConnectionId,
      expiresAtMs: claim.expiresAtMs,
    };

    const importJobId: Id<'importJobs'> = await ctx.runMutation(
      internal.banking.providerMutations.startImportJob,
      {
        userId: request.userId,
        provider: 'enableBanking',
        providerConnectionId: request.providerConnectionId,
        kind: 'connectionCallback',
        trigger: 'callback',
      },
    );

    if (args.error) {
      await ctx.runMutation(internal.banking.providerMutations.failAuthRequest, {
        state: args.state,
        errorCode: args.error,
        errorMessage: args.errorDescription ?? args.error,
      });
      await ctx.runMutation(internal.banking.providerMutations.failImportJob, {
        importJobId,
        status: 'failed',
        errorCode: args.error,
        errorMessage: args.errorDescription ?? args.error,
      });
      return { status: 'failed', reason: args.error };
    }

    if (!args.code) {
      await ctx.runMutation(internal.banking.providerMutations.failAuthRequest, {
        state: args.state,
        errorCode: 'MISSING_CODE',
        errorMessage: 'Enable Banking callback did not include code',
      });
      await ctx.runMutation(internal.banking.providerMutations.failImportJob, {
        importJobId,
        status: 'failed',
        errorCode: 'MISSING_CODE',
        errorMessage: 'Enable Banking callback did not include code',
      });
      return { status: 'failed', reason: 'MISSING_CODE' };
    }

    if (request.expiresAtMs < Date.now()) {
      await ctx.runMutation(internal.banking.providerMutations.failAuthRequest, {
        state: args.state,
        errorCode: 'EXPIRED_STATE',
        errorMessage: 'Enable Banking callback state expired',
      });
      await ctx.runMutation(internal.banking.providerMutations.failImportJob, {
        importJobId,
        status: 'failed',
        errorCode: 'EXPIRED_STATE',
        errorMessage: 'Enable Banking callback state expired',
      });
      return { status: 'failed', reason: 'EXPIRED_STATE' };
    }

    try {
      const session = await enableBankingRequest('POST', '/sessions', {
        body: {
          code: args.code,
        },
      });

      let providerConnectionId: Id<'providerConnections'>;
      try {
        providerConnectionId = await ctx.runMutation(
          internal.banking.providerMutations.completeEnableBankingSession,
          { state: args.state, session },
        );
      } catch (error) {
        // POST /sessions has already created external consent. It was never
        // attached to a connection, so the account wipe cannot discover it.
        if (typeof session?.session_id === 'string' && session.session_id) {
          await revokeDetachedSession(ctx, request.userId, session.session_id);
        }
        throw error;
      }
      await ctx.runMutation(internal.banking.providerMutations.completeImportJob, {
        importJobId,
        providerConnectionId,
      });
      const scheduledSyncs = await scheduleInitialAccountSyncs(ctx, providerConnectionId);

      return { status: 'completed', scheduledSyncs };
    } catch (error) {
      const errorCode = apiErrorCode(error);
      const errorMessage = apiErrorMessage(error);
      await ctx.runMutation(internal.banking.providerMutations.failAuthRequest, {
        state: args.state,
        errorCode,
        errorMessage,
      });
      await ctx.runMutation(internal.banking.providerMutations.failImportJob, {
        importJobId,
        status: 'failed',
        errorCode,
        errorMessage,
      });
      return { status: 'failed', reason: errorCode };
    }
  },
});

export const syncDueAccounts = internalAction({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<SyncDueAccountsResult> => {
    const syncStates = await ctx.runQuery(internal.banking.providerQueries.listDueSyncStates, {
      nowMs: Date.now(),
      limit: Math.min(args.limit ?? 20, 50),
    });

    let attempted = 0;
    let succeeded = 0;

    for (const syncState of syncStates) {
      attempted += 1;
      const result: { ok: boolean } | null = await ctx.runAction(internal.banking.enableBanking.syncAccount, {
        syncStateId: syncState._id,
        trigger: 'cron',
      });
      if (result?.ok) {
        succeeded += 1;
      }
    }

    return { attempted, succeeded };
  },
});

export const syncAccountNow = action({
  args: {
    accountId: v.id('financialAccounts'),
  },
  handler: async (ctx, args): Promise<SyncAccountResult> => {
    const user = await requireAuthUser(ctx);
    const target = await ctx.runQuery(internal.banking.providerQueries.getManualSyncTarget, {
      userId: user.id,
      accountId: args.accountId,
    });

    if (!target) {
      throw new ConvexError('Account not found');
    }

    if (target.connection.provider !== 'enableBanking' || target.account.provider !== 'enableBanking') {
      throw new ConvexError('Manual sync is only available for Enable Banking accounts');
    }

    if (buildConnectionHealth(target.connection).requiresReauthorization) {
      await ctx.runMutation(internal.banking.providerMutations.markConnectionReauthorizationRequired, {
        providerConnectionId: target.connection._id,
        errorCode: 'ACCESS_EXPIRED',
        errorMessage: 'Bank consent expired. Reconnect this bank to resume sync.',
      });
      throw new ConvexError('Bank consent expired. Reconnect this bank to resume sync.');
    }

    if (!target.account.syncEnabled || target.syncState.status === 'paused') {
      throw new ConvexError('Enable account sync before running a manual refresh');
    }

    if (target.syncState.status === 'rateLimited' && target.syncState.nextSyncAfterMs > Date.now()) {
      throw new ConvexError('This account is temporarily rate-limited by the bank');
    }

    const result: SyncAccountResult = await ctx.runAction(internal.banking.enableBanking.syncAccount, {
      syncStateId: target.syncState._id,
      trigger: 'manual',
    });

    return result;
  },
});

export const syncAccount = internalAction({
  args: {
    syncStateId: v.id('accountSyncStates'),
    trigger: v.optional(v.union(v.literal('initialCallback'), v.literal('cron'), v.literal('manual'))),
  },
  handler: async (ctx, args): Promise<SyncAccountResult> => {
    const bundle = await ctx.runQuery(internal.banking.providerQueries.getSyncBundle, {
      syncStateId: args.syncStateId,
    });

    if (!bundle || bundle.connection.provider !== 'enableBanking' || bundle.account.provider !== 'enableBanking') {
      return null;
    }

    const { dateFrom, dateTo } = enableBankingSyncWindow({
      lastBookedDate: bundle.syncState.lastBookedDate,
      backfillFromDate: bundle.syncState.backfillFromDate,
      today: todayIsoDate(),
    });
    const importJobId: Id<'importJobs'> = await ctx.runMutation(
      internal.banking.providerMutations.startImportJob,
      {
        userId: bundle.syncState.userId,
        provider: 'enableBanking',
        providerConnectionId: bundle.connection._id,
        accountId: bundle.account._id,
        kind: args.trigger === 'manual' ? 'accountRefresh' : 'accountBackfill',
        trigger: args.trigger ?? 'cron',
        dateFrom,
        dateTo,
        transactionStatus: 'BOOK',
      },
    );

    if (buildConnectionHealth(bundle.connection).requiresReauthorization) {
      const errorCode = 'ACCESS_EXPIRED';
      const errorMessage = 'Bank consent expired. Reconnect this bank to resume sync.';
      await ctx.runMutation(internal.banking.providerMutations.markConnectionReauthorizationRequired, {
        providerConnectionId: bundle.connection._id,
        errorCode,
        errorMessage,
      });
      await ctx.runMutation(internal.banking.providerMutations.failImportJob, {
        importJobId,
        status: 'failed',
        errorCode,
        errorMessage,
      });
      return { ok: false };
    }

    if (!bundle.connection.sessionId || !bundle.account.syncEnabled) {
      const errorCode = 'SYNC_NOT_AVAILABLE';
      const errorMessage = 'Account sync is not available for this connection';
      await ctx.runMutation(internal.banking.providerMutations.markSyncFailed, {
        syncStateId: args.syncStateId,
        errorCode,
        errorMessage,
      });
      await ctx.runMutation(internal.banking.providerMutations.failImportJob, {
        importJobId,
        status: 'failed',
        errorCode,
        errorMessage,
      });
      return { ok: false };
    }

    const balances: Array<unknown> = [];
    const transactions: Array<unknown> = [];
    let continuationKey: string | undefined;
    let transactionPagesFetched = 0;

    try {
      const balancePayload = await enableBankingRequest(
        'GET',
        `/accounts/${bundle.account.providerAccountId}/balances`,
      );
      const balanceRows = Array.isArray(balancePayload) ? balancePayload : asRecord(balancePayload).balances;
      if (Array.isArray(balanceRows)) {
        balances.push(...balanceRows);
      }

      do {
        const query: Record<string, string> = {
          date_from: dateFrom,
          date_to: dateTo,
          transaction_status: 'BOOK',
          ...(continuationKey ? { continuation_key: continuationKey } : {}),
        };
        const payload = (await enableBankingRequest('GET', `/accounts/${bundle.account.providerAccountId}/transactions`, {
          query,
        })) as { transactions?: Array<unknown>; continuation_key?: string };

        transactionPagesFetched += 1;
        transactions.push(...(payload.transactions ?? []));
        continuationKey = payload.continuation_key;
      } while (continuationKey);

      const balanceResult: BalanceImportResult = await ctx.runMutation(internal.banking.providerMutations.upsertAccountBalances, {
        accountId: bundle.account._id,
        providerConnectionId: bundle.connection._id,
        provider: 'enableBanking',
        balances,
      });

      // Chunk imports so one mutation never processes an unbounded provider
      // batch (each row costs several reads/writes inside the transaction).
      const transactionResult: TransactionImportResult = {
        imported: 0,
        seen: 0,
        latestBookedDate: null,
      };
      const chunkCount = Math.max(1, Math.ceil(transactions.length / TRANSACTION_IMPORT_CHUNK_SIZE));
      for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
        const chunk = transactions.slice(
          chunkIndex * TRANSACTION_IMPORT_CHUNK_SIZE,
          (chunkIndex + 1) * TRANSACTION_IMPORT_CHUNK_SIZE,
        );
        const chunkResult: TransactionImportResult = await ctx.runMutation(
          internal.banking.providerMutations.upsertTransactions,
          {
            accountId: bundle.account._id,
            providerConnectionId: bundle.connection._id,
            syncStateId: bundle.syncState._id,
            provider: 'enableBanking',
            transactionStatus: 'BOOK',
            transactions: chunk,
          },
        );
        transactionResult.imported += chunkResult.imported;
        transactionResult.seen += chunkResult.seen;
        if (
          chunkResult.latestBookedDate &&
          (!transactionResult.latestBookedDate ||
            chunkResult.latestBookedDate > transactionResult.latestBookedDate)
        ) {
          transactionResult.latestBookedDate = chunkResult.latestBookedDate;
        }
      }

      await ctx.runMutation(internal.banking.providerMutations.completeImportJob, {
        importJobId,
        balancesSeen: balanceResult.seen,
        balancesImported: balanceResult.inserted,
        transactionsSeen: transactionResult.seen,
        transactionsImported: transactionResult.imported,
        transactionPagesFetched,
      });

      return { ok: true };
    } catch (error) {
      const errorCode = apiErrorCode(error);
      const errorMessage = apiErrorMessage(error);

      if (requiresReauthorizationError(errorCode, error)) {
        await ctx.runMutation(internal.banking.providerMutations.markConnectionReauthorizationRequired, {
          providerConnectionId: bundle.connection._id,
          errorCode,
          errorMessage,
        });
        await ctx.runMutation(internal.banking.providerMutations.failImportJob, {
          importJobId,
          status: 'failed',
          errorCode,
          errorMessage,
          continuationKey,
          balancesSeen: balances.length,
          balancesImported: 0,
          transactionsSeen: transactions.length,
          transactionsImported: 0,
          transactionPagesFetched,
        });
        return { ok: false };
      }

      if (
        errorCode === 'ASPSP_RATE_LIMIT_EXCEEDED' ||
        (error instanceof EnableBankingApiError && error.status === 429)
      ) {
        const retryAfterMs = Date.now() + 6 * 60 * 60 * 1000;
        await ctx.runMutation(internal.banking.providerMutations.markSyncRateLimited, {
          syncStateId: args.syncStateId,
          errorCode,
          errorMessage,
          retryAfterMs,
        });
        await ctx.runMutation(internal.banking.providerMutations.failImportJob, {
          importJobId,
          status: 'rateLimited',
          errorCode,
          errorMessage,
          nextRetryAtMs: retryAfterMs,
          continuationKey,
          balancesSeen: balances.length,
          balancesImported: 0,
          transactionsSeen: transactions.length,
          transactionsImported: 0,
          transactionPagesFetched,
        });
        return { ok: false };
      }

      await ctx.runMutation(internal.banking.providerMutations.markSyncFailed, {
        syncStateId: args.syncStateId,
        errorCode,
        errorMessage,
      });
      await ctx.runMutation(internal.banking.providerMutations.failImportJob, {
        importJobId,
        status: 'failed',
        errorCode,
        errorMessage,
        continuationKey,
        balancesSeen: balances.length,
        balancesImported: 0,
        transactionsSeen: transactions.length,
        transactionsImported: 0,
        transactionPagesFetched,
      });
      return { ok: false };
    }
  },
});
