import { afterEach, expect, test, vi } from 'vitest';
import { generateText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { createAnalystTelemetry } from './telemetry';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
test('AI SDK and Langfuse export technical metadata through fetch without prompt or output bodies', async () => {
  vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'public-test');
  vi.stubEnv('LANGFUSE_SECRET_KEY', 'secret-test');
  vi.stubEnv('LANGFUSE_BASE_URL', 'https://telemetry.example.test');
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response('{}')));
  vi.stubGlobal('fetch', fetchMock);
  const { telemetry, flush } = createAnalystTelemetry({
    userId: 'synthetic-user',
    threadId: 'synthetic-thread',
    modelId: 'example',
  });
  const result = await generateText({
    model: new MockLanguageModelV4({
      doGenerate: () =>
        Promise.resolve({
          content: [{ type: 'text', text: 'PRIVATE_OUTPUT_SENTINEL' }],
          finishReason: { unified: 'stop', raw: undefined },
          usage: {
            inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 20, text: 20, reasoning: undefined },
          },
          warnings: [],
        }),
    }),
    prompt: 'PRIVATE_INPUT_SENTINEL',
    telemetry,
  });
  expect(result.text).toBe('PRIVATE_OUTPUT_SENTINEL');
  await flush();
  expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
  const payloads = fetchMock.mock.calls.map((call) => call[1].body).join('\n');
  expect(payloads).toContain('synthetic-user');
  expect(payloads).toContain('synthetic-thread');
  expect(payloads).not.toContain('PRIVATE_INPUT_SENTINEL');
  expect(payloads).not.toContain('PRIVATE_OUTPUT_SENTINEL');
});
