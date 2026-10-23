import { afterEach, expect, test, vi } from 'vitest';
import { ExportResultCode } from '@opentelemetry/core';
import { SimpleSpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace';
import { ConvexTraceExporter } from './telemetryExporter';

afterEach(() => vi.unstubAllGlobals());
test('technical spans use fetch with OTLP JSON, authentication, no redirect and a bounded timeout', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
  vi.stubGlobal('fetch', fetchMock);
  const exporter = new ConvexTraceExporter('public-test', 'secret-test', 'https://telemetry.example.test');
  const provider = new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter })] });
  const tracer = provider.getTracer('analyst');
  const span = tracer.startSpan('chat example', {
    attributes: { 'gen_ai.operation.name': 'chat', 'gen_ai.request.model': 'example-model' },
  });
  span.end();
  await provider.forceFlush();
  expect(fetchMock).toHaveBeenCalledOnce();
  const [url, request] = fetchMock.mock.calls[0];
  expect(url.toString()).toBe('https://telemetry.example.test/api/public/otel/v1/traces');
  expect(request).toMatchObject({
    method: 'POST',
    redirect: 'error',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${btoa('public-test:secret-test')}` },
  });
  expect(request.signal).toBeInstanceOf(AbortSignal);
  const payload = JSON.parse(request.body);
  expect(payload.resourceSpans[0].scopeSpans[0].spans[0].name).toBe('chat example');
  await provider.shutdown();
});

test('rejected exports report failure without exposing upstream bodies or credentials', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('sensitive upstream body', { status: 503 })));
  const exporter = new ConvexTraceExporter('public-test', 'secret-test');
  const result = await new Promise<{ code: number; error?: Error }>((resolve) => exporter.export([], resolve));
  expect(result.code).toBe(ExportResultCode.FAILED);
  expect(result.error?.message).toBe('Telemetry export failed');
  await exporter.shutdown();
});

test.each(['http://telemetry.test', 'https://user:password@telemetry.test', 'https://telemetry.test?token=x'])(
  'rejects unsafe credential destinations %s',
  (url) => {
    expect(() => new ConvexTraceExporter('public', 'secret', url)).toThrow();
  },
);
