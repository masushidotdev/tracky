import { httpRouter } from 'convex/server';
import { Webhook } from 'svix';
import { httpAction } from './_generated/server';
import { internal } from './_generated/api';
import { authKit } from './auth';
import { resend } from './analyst/emails';
import {
  isValidTelegramWebhookSecret,
  parseTelegramUpdate,
  safeSecretEqual,
  sha256Hex,
} from './analyst/telegramCore';
import { telegramFunctionRefs } from './analyst/telegramRefs';

const http = httpRouter();
authKit.registerRoutes(http);

http.route({
  path: '/resend-webhook',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
    if (!secret) {
      return new Response('Resend webhook is not configured', { status: 503 });
    }
    const raw = await request.text();
    try {
      new Webhook(secret).verify(raw, {
        'svix-id': request.headers.get('svix-id') ?? '',
        'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
        'svix-signature': request.headers.get('svix-signature') ?? '',
      });
    } catch {
      return new Response('Invalid signature', { status: 401 });
    }
    const forward = new Request(request.url, {
      method: 'POST',
      headers: request.headers,
      body: raw,
    });
    return await resend.handleResendEventWebhook(ctx, forward);
  }),
});

http.route({
  path: '/telegram-webhook',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
    if (!isValidTelegramWebhookSecret(expectedSecret)) {
      return new Response('Telegram webhook is not configured', { status: 503 });
    }
    if (!safeSecretEqual(request.headers.get('X-Telegram-Bot-Api-Secret-Token'), expectedSecret)) {
      return new Response('Unauthorized', { status: 401 });
    }
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      return new Response('Unsupported media type', { status: 415 });
    }
    const contentLength = Number(request.headers.get('content-length') ?? '0');
    if (Number.isFinite(contentLength) && contentLength > 65_536) {
      return new Response('Payload too large', { status: 413 });
    }
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 65_536) {
      return new Response('Payload too large', { status: 413 });
    }
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }
    const update = parseTelegramUpdate(body);
    if (!update) return new Response('OK', { status: 200 });
    const linkCodeHash = update.linkCode ? await sha256Hex(update.linkCode) : undefined;
    await ctx.runMutation(telegramFunctionRefs.acceptUpdate, {
      updateId: update.updateId,
      chatId: update.chatId,
      text: update.linkCommand ? '/link [redacted]' : update.text,
      locale: update.locale,
      linkCommand: update.linkCommand,
      linkCodeHash,
    });
    return new Response('OK', { status: 200 });
  }),
});

function isLocalhost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
}

function validateEnableBankingReturnUrl() {
  const returnUrl = process.env.ENABLE_BANKING_RETURN_URL;
  if (!returnUrl) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(returnUrl);
  } catch {
    throw new Error('ENABLE_BANKING_RETURN_URL must be a valid absolute URL.');
  }

  const isAllowedProtocol =
    url.protocol === 'https:' || (url.protocol === 'http:' && isLocalhost(url.hostname));
  if (!isAllowedProtocol || url.username || url.password) {
    throw new Error(
      'ENABLE_BANKING_RETURN_URL must use https, or http only on localhost, and must not include credentials.',
    );
  }

  return url.toString();
}

const ENABLE_BANKING_RETURN_URL = validateEnableBankingReturnUrl();

function enableBankingReturnUrl(state: string, status: 'completed' | 'failed') {
  if (!ENABLE_BANKING_RETURN_URL) {
    return null;
  }

  const url = new URL(ENABLE_BANKING_RETURN_URL);
  url.searchParams.set('bankConnectionState', state);
  url.searchParams.set('bankConnectionStatus', status);
  return url.toString();
}

function callbackHtml(status: 'completed' | 'failed') {
  const title = status === 'completed' ? 'Bank connection received' : 'Bank connection failed';
  const body =
    status === 'completed'
      ? 'Bank connection received. You can return to Tracky.'
      : 'Bank connection failed. Return to Tracky and try again.';

  return `<!doctype html><title>Tracky</title><h1>${title}</h1><p>${body}</p>`;
}

http.route({
  path: '/enablebanking/callback',
  method: 'GET',
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const state = url.searchParams.get('state');

    if (!state) {
      return new Response('Missing Enable Banking state', { status: 400 });
    }

    let status: 'completed' | 'failed' = 'failed';

    try {
      const result = await ctx.runAction(internal.banking.enableBanking.exchangeCallback, {
        state,
        code: url.searchParams.get('code') ?? undefined,
        error: url.searchParams.get('error') ?? undefined,
        errorDescription: url.searchParams.get('error_description') ?? undefined,
      });
      status = result.status;
    } catch {
      status = 'failed';
    }

    const returnUrl = enableBankingReturnUrl(state, status);
    if (returnUrl) {
      return Response.redirect(returnUrl, 303);
    }

    return new Response(callbackHtml(status), {
      status: status === 'completed' ? 200 : 400,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  }),
});

export default http;
