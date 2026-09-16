const TELEGRAM_TEXT_LIMIT = 4_096;
const MAX_INBOUND_TEXT = 4_000;
export const LINK_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LINK_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8,16}$/;
const WEBHOOK_SECRET_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;

export type ParsedTelegramUpdate = {
  updateId: number;
  chatId: string;
  text: string;
  locale: 'en' | 'it';
  linkCommand: boolean;
  linkCode?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function safeSecretEqual(actual: string | null, expected: string) {
  if (actual === null || actual.length !== expected.length || expected.length === 0) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return mismatch === 0;
}

export function isValidTelegramWebhookSecret(value: string | undefined): value is string {
  return value !== undefined && WEBHOOK_SECRET_PATTERN.test(value);
}

export function normalizeTelegramLocale(languageCode: unknown): 'en' | 'it' {
  return typeof languageCode === 'string' && languageCode.toLowerCase().startsWith('it') ? 'it' : 'en';
}

export function normalizeLinkCode(value: string) {
  const code = value.trim().toUpperCase();
  return LINK_CODE_PATTERN.test(code) ? code : null;
}

export function randomLinkCode(codeLength = 12) {
  const bytes = crypto.getRandomValues(new Uint8Array(codeLength));
  // Alphabet length is a power of two (32), so masking the low 5 bits maps
  // each byte to an index uniformly — modulo on random bytes risks bias.
  return [...bytes].map((byte) => LINK_CODE_ALPHABET[byte & (LINK_CODE_ALPHABET.length - 1)]).join('');
}

export function parseTelegramUpdate(value: unknown): ParsedTelegramUpdate | null {
  if (!isRecord(value) || !Number.isSafeInteger(value.update_id) || (value.update_id as number) < 0) return null;
  if (!isRecord(value.message)) return null;
  const message = value.message;
  if (typeof message.text !== 'string' || message.text.length === 0 || message.text.length > MAX_INBOUND_TEXT) return null;
  if (!isRecord(message.chat) || message.chat.type !== 'private') return null;
  if (!['number', 'string'].includes(typeof message.chat.id)) return null;
  if (!isRecord(message.from) || message.from.is_bot !== false) return null;
  const text = message.text.trim();
  if (!text) return null;
  const command = /^\/link(?:@[A-Za-z0-9_]+)?(?:\s+(.+))?$/i.exec(text);
  const linkCode = command?.[1] ? normalizeLinkCode(command[1]) ?? undefined : undefined;
  return {
    updateId: value.update_id as number,
    chatId: String(message.chat.id),
    text,
    locale: normalizeTelegramLocale(message.from.language_code),
    linkCommand: Boolean(command),
    ...(linkCode ? { linkCode } : {}),
  };
}

export function telegramTextChunks(text: string) {
  const normalized = truncateTelegramText(text, TELEGRAM_TEXT_LIMIT * 3);
  if (!normalized) return [];
  const chunks: Array<string> = [];
  let remaining = normalized;
  while (remaining.length > TELEGRAM_TEXT_LIMIT) {
    const safeWindow = truncateTelegramText(remaining, TELEGRAM_TEXT_LIMIT);
    const splitAt = Math.max(safeWindow.lastIndexOf('\n'), safeWindow.lastIndexOf(' '));
    const boundary = splitAt >= TELEGRAM_TEXT_LIMIT / 2 ? splitAt : safeWindow.length;
    chunks.push(remaining.slice(0, boundary).trimEnd());
    remaining = remaining.slice(boundary).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export function shouldContinueTelegramChunkDelivery(acknowledgement: {
  accepted: boolean;
  completed: boolean;
}) {
  return acknowledgement.accepted && !acknowledgement.completed;
}

export function truncateTelegramText(text: string, maxCodeUnits: number) {
  const normalized = text.trim();
  if (!normalized || maxCodeUnits <= 0) return '';
  if (normalized.length <= maxCodeUnits) return normalized;
  let boundary = maxCodeUnits;
  const finalCodeUnit = normalized.charCodeAt(boundary - 1);
  const nextCodeUnit = normalized.charCodeAt(boundary);
  if (finalCodeUnit >= 0xd800 && finalCodeUnit <= 0xdbff && nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
    boundary -= 1;
  }
  return normalized.slice(0, boundary);
}

export function telegramLinkReply(locale: string, state: 'linked' | 'invalid' | 'conflict' | 'alreadyLinked') {
  const italian = locale.startsWith('it');
  if (state === 'linked') return italian ? 'Telegram è ora collegato a Tracky.' : 'Telegram is now linked to Tracky.';
  if (state === 'alreadyLinked') return italian ? 'Questo account è già collegato.' : 'This account is already linked.';
  if (state === 'conflict') {
    return italian
      ? 'Questo account o questa chat è già collegato altrove. Scollegalo dalla web app di Tracky.'
      : 'This account or chat is already linked elsewhere. Unlink it in the Tracky web app.';
  }
  return italian
    ? 'Codice non valido o scaduto. Generane uno nuovo nella sezione Analyst di Tracky.'
    : 'Invalid or expired code. Generate a new one in Tracky’s Analyst section.';
}

export function telegramUnlinkedReply(locale: string) {
  return locale.startsWith('it')
    ? 'Collega prima Telegram dalla sezione Analyst di Tracky usando /link CODICE.'
    : 'Link Telegram first from Tracky’s Analyst section using /link CODE.';
}

export function telegramRateLimitReply(locale: string) {
  return locale.startsWith('it')
    ? 'Hai raggiunto il limite messaggi dell’Analyst. Attendi e riprova più tardi.'
    : 'You reached the Analyst message limit. Wait and try again later.';
}

export function telegramApprovalReply(locale: string) {
  return locale.startsWith('it')
    ? 'Questa richiesta richiede una conferma. Apri la stessa conversazione nella web app di Tracky per approvare o negare: non approvo mai modifiche automaticamente.'
    : 'This request needs confirmation. Open the same conversation in the Tracky web app to approve or deny it; I never auto-approve changes.';
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
