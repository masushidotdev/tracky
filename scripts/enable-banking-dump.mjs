#!/usr/bin/env node

import { createSign } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const DEFAULT_API_BASE = 'https://api.enablebanking.com';
const DEFAULT_STATUSES = ['BOOK', 'PDNG'];

function convex(args) {
  return execFileSync('npx', ['convex', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim();
}

function convexEnv(name, targetArgs) {
  const value = convex(['env', 'get', name, ...targetArgs]);
  if (!value) {
    throw new Error(`Missing Convex environment variable: ${name}`);
  }
  return value;
}

function deploymentArgs() {
  const deploymentIndex = process.argv.indexOf('--deployment');
  if (deploymentIndex >= 0) {
    const deployment = process.argv[deploymentIndex + 1];
    if (!deployment) {
      throw new Error('--deployment requires a value');
    }
    return ['--deployment', deployment];
  }
  return process.argv.includes('--prod') ? ['--prod'] : [];
}

function optionValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!value) throw new Error(`${name} requires a value`);
  return value;
}

function makeJwt(appId, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(value).toString('base64url');
  const header = encode(JSON.stringify({ typ: 'JWT', alg: 'RS256', kid: appId }));
  const payload = encode(
    JSON.stringify({
      iss: 'enablebanking.com',
      aud: 'api.enablebanking.com',
      iat: now,
      exp: now + 3600,
    }),
  );
  const signingInput = `${header}.${payload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  return `${signingInput}.${signer.sign(privateKey).toString('base64url')}`;
}

function safeFilePart(value) {
  return value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 48);
}

function isoDateDaysAgo(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

async function requestJson({ apiBase, jwt, path, query }) {
  const url = new URL(path, apiBase);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value) url.searchParams.set(key, value);
  }
  const response = await fetch(url, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${jwt}` },
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { unparsedBody: text };
  }
  return {
    request: { method: 'GET', path: url.pathname, query: Object.fromEntries(url.searchParams) },
    response: { status: response.status, ok: response.ok, payload },
  };
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

async function main() {
  const targetArgs = deploymentArgs();
  const now = new Date();
  const runId = now.toISOString().replaceAll(':', '-');
  const outputDir = resolve('diagnostics', 'enable-banking', runId);
  await mkdir(outputDir, { recursive: true, mode: 0o700 });

  const accounts = JSON.parse(
    convex(['data', 'financialAccounts', '--limit', '200', '--format', 'json', ...targetArgs]),
  );
  const syncStates = JSON.parse(
    convex(['data', 'accountSyncStates', '--limit', '200', '--format', 'json', ...targetArgs]),
  );
  const appId = convexEnv('ENABLE_BANKING_APP_ID', targetArgs);
  const privateKey = convexEnv('ENABLE_BANKING_PRIVATE_KEY', targetArgs).replaceAll('\\n', '\n');
  const apiBase = convexEnv('ENABLE_BANKING_API_BASE', targetArgs) || DEFAULT_API_BASE;
  const jwt = makeJwt(appId, privateKey);
  const syncByAccountId = new Map(syncStates.map((state) => [state.accountId, state]));
  const requestedAccountId = optionValue('--account-id');
  const providerAccounts = accounts.filter(
    (account) =>
      account.provider === 'enableBanking' &&
      account.providerAccountId &&
      (!requestedAccountId || account._id === requestedAccountId),
  );
  const manifest = {
    generatedAt: now.toISOString(),
    deployment: targetArgs.length === 0 ? 'dev' : targetArgs.join(' '),
    statuses: DEFAULT_STATUSES,
    accounts: [],
  };

  for (const account of providerAccounts) {
    const syncState = syncByAccountId.get(account._id);
    const providerSafeFromDate = isoDateDaysAgo(90);
    const requestedFromDate = syncState?.lastBookedDate ?? syncState?.backfillFromDate ?? providerSafeFromDate;
    const dateFrom = requestedFromDate > providerSafeFromDate ? requestedFromDate : providerSafeFromDate;
    const dateTo = now.toISOString().slice(0, 10);
    const filePrefix = `${safeFilePart(account.institutionName ?? account.name)}-${account.providerAccountId.slice(-8)}`;
    const accountSummary = {
      localAccountId: account._id,
      providerAccountId: account.providerAccountId,
      name: account.name,
      institutionName: account.institutionName ?? null,
      syncEnabled: account.syncEnabled,
      syncStatus: syncState?.status ?? null,
      dateFrom,
      dateTo,
      files: [],
    };

    const endpoints = [['balances', `/accounts/${account.providerAccountId}/balances`, undefined]];
    for (const [label, path, query] of endpoints) {
      const result = await requestJson({ apiBase, jwt, path, query });
      const filename = `${filePrefix}-${label}.json`;
      await writeJson(resolve(outputDir, filename), result);
      accountSummary.files.push(filename);
    }

    for (const status of DEFAULT_STATUSES) {
      let continuationKey;
      let page = 1;
      do {
        const result = await requestJson({
          apiBase,
          jwt,
          path: `/accounts/${account.providerAccountId}/transactions`,
          query: {
            date_from: dateFrom,
            date_to: dateTo,
            transaction_status: status,
            ...(continuationKey ? { continuation_key: continuationKey } : {}),
          },
        });
        const filename = `${filePrefix}-transactions-${status.toLowerCase()}-${String(page).padStart(3, '0')}.json`;
        await writeJson(resolve(outputDir, filename), result);
        accountSummary.files.push(filename);
        if (!result.response.ok) break;
        continuationKey = result.response.payload?.continuation_key;
        page += 1;
      } while (continuationKey);
    }

    manifest.accounts.push(accountSummary);
  }

  await writeJson(resolve(outputDir, 'manifest.json'), manifest);
  process.stdout.write(`${outputDir}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
