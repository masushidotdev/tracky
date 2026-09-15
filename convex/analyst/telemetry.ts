'use node';

import { LangfuseSpanProcessor } from '@langfuse/otel';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import type { TelemetrySettings } from 'ai';

export function createAnalystTelemetry({
  userId,
  threadId,
  modelId,
}: {
  userId: string;
  threadId: string;
  modelId: string;
}): { telemetry: TelemetrySettings | undefined; flush: () => Promise<void> } {
  if (!process.env.LANGFUSE_PUBLIC_KEY) {
    return { telemetry: undefined, flush: () => Promise.resolve() };
  }

  const processor = new LangfuseSpanProcessor({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_BASE_URL,
    exportMode: 'immediate',
  });
  const provider = new NodeTracerProvider({ spanProcessors: [processor] });
  const tracer = provider.getTracer('analyst');
  return {
    telemetry: { isEnabled: true, tracer, metadata: { userId, threadId, modelId } },
    flush: async () => {
      await processor.forceFlush();
      await provider.shutdown();
    },
  };
}
