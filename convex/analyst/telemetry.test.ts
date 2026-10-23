// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest';
import { createAnalystTelemetry } from './telemetry';

const lifecycle = vi.hoisted(() => ({ flush: vi.fn(), shutdown: vi.fn() }));
vi.mock('@langfuse/otel', () => ({
  LangfuseSpanProcessor: class {
    onStart() {}
    onEnd() {}
    forceFlush = lifecycle.flush.mockResolvedValue(undefined);
    shutdown = lifecycle.shutdown.mockResolvedValue(undefined);
  },
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

test('Analyst tracing stays disabled when the feature key is absent', async () => {
  vi.stubEnv('LANGFUSE_PUBLIC_KEY', '');
  const result = createAnalystTelemetry({ userId: 'a', threadId: 'one', modelId: 'example' });
  expect(result.telemetry).toBeUndefined();
  await result.flush();
  expect(lifecycle.flush).not.toHaveBeenCalled();
});

test('tracing excludes financial bodies and gives each generation its own integration', async () => {
  vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'local-test-key');
  vi.stubEnv('LANGFUSE_SECRET_KEY', 'local-test-secret');
  const first = createAnalystTelemetry({ userId: 'a', threadId: 'one', modelId: 'example' });
  const second = createAnalystTelemetry({ userId: 'b', threadId: 'two', modelId: 'example' });
  expect(first.telemetry).toMatchObject({ isEnabled: true, recordInputs: false, recordOutputs: false });
  expect(second.telemetry?.integrations).not.toBe(first.telemetry?.integrations);
  await first.flush();
  await second.flush();
  expect(lifecycle.flush).toHaveBeenCalledTimes(2);
  expect(lifecycle.shutdown).toHaveBeenCalledTimes(2);
});
