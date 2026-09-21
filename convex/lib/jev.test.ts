// @vitest-environment node
import { describe, expect, test, vi } from 'vitest';
import { JEV_PINNED_MODEL, JevError, decide, minimizeJevText } from './jev';

describe('jev client', () => {
  test('fails closed without a key', async () => {
    await expect(decide({ ping: 1 }, {}, { apiKey: '' })).rejects.toMatchObject({ code: 'JEV_MISSING_KEY' });
  });

  test('validates the answers shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => Promise.resolve({ model: JEV_PINNED_MODEL, answers: { a: { type: 'noul' } } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(decide({ ping: 1 }, { a: { type: 'noul', instructions: 'x' } }, { apiKey: 'k' })).rejects.toMatchObject({
        code: 'JEV_SHAPE',
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test('returns calibrated answers with latency', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => Promise.resolve({
        model: JEV_PINNED_MODEL,
        answers: { a: { type: 'noul', noul: 0.9 } },
        usage: { input_tokens: 10, output_tokens: 2, cost: 0.000001 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const result = await decide({ ping: 1 }, { a: { type: 'noul', instructions: 'x' } }, { apiKey: 'k' });
      expect(result.answers.a).toEqual({ type: 'noul', noul: 0.9 });
      expect(result.latencyMs).toEqual(expect.any(Number));
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe(JEV_PINNED_MODEL);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test('retries 429 once then fails closed on HTTP errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, headers: new Headers(), text: () => Promise.resolve('slow') })
      .mockResolvedValueOnce({ ok: false, status: 400, headers: new Headers(), text: () => Promise.resolve('bad') });
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(
        decide({ ping: 1 }, { a: { type: 'noul', instructions: 'x' } }, { apiKey: 'k' }),
      ).rejects.toBeInstanceOf(JevError);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test('minimizes PII in state text', () => {
    expect(minimizeJevText('BONIFICO ACME BANK CONTO 4242 ALEX RIVERA')).not.toContain('IT60X');
    expect(minimizeJevText('x'.repeat(600))).toHaveLength(500);
  });

  test('redacts IBAN-like strings', () => {
    const redacted = minimizeJevText(`BONIFICO IT60X0542811101000000123${'4'.repeat(3)}`);
    expect(redacted).toBe('BONIFICO [IBAN]');
  });
});
