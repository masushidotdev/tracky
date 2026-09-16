// @vitest-environment node

import { describe, expect, test, vi } from 'vitest';
import {
  LINK_CODE_ALPHABET,
  isValidTelegramWebhookSecret,
  normalizeLinkCode,
  parseTelegramUpdate,
  randomLinkCode,
  safeSecretEqual,
  sha256Hex,
  shouldContinueTelegramChunkDelivery,
  telegramTextChunks,
  truncateTelegramText,
} from './telegramCore';

function update(overrides: Record<string, unknown> = {}) {
  return {
    update_id: 42,
    message: {
      text: '/link ABCDEFGH',
      chat: { id: 123, type: 'private' },
      from: { id: 7, is_bot: false, language_code: 'it-IT' },
    },
    ...overrides,
  };
}

describe('Telegram webhook boundary', () => {
  test('parses private text updates and redacts invalid link code shapes from linking', () => {
    expect(parseTelegramUpdate(update())).toMatchObject({
      updateId: 42,
      chatId: '123',
      locale: 'it',
      linkCommand: true,
      linkCode: 'ABCDEFGH',
    });
    expect(normalizeLinkCode('abc0efgh')).toBeNull();
    expect(parseTelegramUpdate(update({ message: { text: 'hello', chat: { id: 1, type: 'group' }, from: {} } }))).toBeNull();
    expect(parseTelegramUpdate(update({ message: { text: 'hello', chat: { id: 1, type: 'private' }, from: { is_bot: true } } }))).toBeNull();
  });

  test('compares webhook secrets exactly and hashes without retaining the code', async () => {
    expect(safeSecretEqual('secret_123', 'secret_123')).toBe(true);
    expect(safeSecretEqual('secret_124', 'secret_123')).toBe(false);
    expect(safeSecretEqual(null, 'secret_123')).toBe(false);
    expect(await sha256Hex('ABCDEFGH')).toMatch(/^[a-f0-9]{64}$/);
  });

  test('generates link codes from the alphabet without modulo bias', () => {
    for (const code of [randomLinkCode(), randomLinkCode()]) {
      expect(code).toHaveLength(12);
      expect([...code].every((char) => LINK_CODE_ALPHABET.includes(char))).toBe(true);
    }
    // 32 divides 256, so the mask stays uniform; guard the invariant.
    expect(256 % LINK_CODE_ALPHABET.length).toBe(0);
    // Pin the index mapping: byte 255 masks to index 31, i.e. '9'.
    const spy = vi.spyOn(crypto, 'getRandomValues').mockImplementation(((array: Uint8Array) => {
      array.fill(255);
      return array;
    }) as typeof crypto.getRandomValues);
    try {
      expect(randomLinkCode()).toBe('9'.repeat(12));
    } finally {
      spy.mockRestore();
    }
  });

  test('requires a webhook secret with at least 32 allowed characters', () => {
    expect(isValidTelegramWebhookSecret('a'.repeat(32))).toBe(true);
    expect(isValidTelegramWebhookSecret('a'.repeat(31))).toBe(false);
    expect(isValidTelegramWebhookSecret(`${'a'.repeat(31)}!`)).toBe(false);
    expect(isValidTelegramWebhookSecret(undefined)).toBe(false);
  });

  test('splits plain text at Telegram boundaries without data-sized chunks', () => {
    const chunks = telegramTextChunks(`${'a'.repeat(4_000)} ${'b'.repeat(4_000)} ${'c'.repeat(4_000)}`);
    expect(chunks.length).toBe(3);
    expect(chunks.every((chunk) => chunk.length <= 4_096)).toBe(true);
    expect(telegramTextChunks('   ')).toEqual([]);
  });

  test('preserves Unicode code points at chunk and truncation boundaries', () => {
    const boundaryChunk = telegramTextChunks(`${'a'.repeat(4_095)}💸`);
    expect(boundaryChunk).toEqual(['a'.repeat(4_095), '💸']);
    expect(boundaryChunk.every((chunk) => chunk.length <= 4_096)).toBe(true);
    expect(boundaryChunk.join('')).toBe(`${'a'.repeat(4_095)}💸`);

    const truncated = truncateTelegramText(`${'b'.repeat(12_287)}💸tail`, 12_288);
    expect(truncated).toBe('b'.repeat(12_287));
    expect(truncated.length).toBeLessThanOrEqual(12_288);
    expect(truncated).not.toContain('\uFFFD');
    expect(truncateTelegramText(`${'b'.repeat(12_286)}💸tail`, 12_288).endsWith('💸')).toBe(true);
  });

  test('continues chunk delivery only after an accepted non-final acknowledgement', () => {
    expect(shouldContinueTelegramChunkDelivery({ accepted: false, completed: false })).toBe(false);
    expect(shouldContinueTelegramChunkDelivery({ accepted: true, completed: true })).toBe(false);
    expect(shouldContinueTelegramChunkDelivery({ accepted: true, completed: false })).toBe(true);
  });
});
