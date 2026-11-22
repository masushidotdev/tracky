import { LangfuseSpanProcessor } from '@langfuse/otel';
import { OpenTelemetry } from '@ai-sdk/otel';
import { TracerProvider } from '@opentelemetry/sdk-trace';
import { env } from '../_generated/server';
import { ConvexTraceExporter } from './telemetryExporter';
import type { TelemetryOptions } from 'ai';

export function createAnalystTelemetry({
  userId,
  threadId,
  modelId,
}: {
  userId: string;
  threadId: string;
  modelId: string;
}): { telemetry: TelemetryOptions | undefined; flush: () => Promise<void> } {
  if (!env.LANGFUSE_PUBLIC_KEY || !env.LANGFUSE_SECRET_KEY) {
    return { telemetry: undefined, flush: () => Promise.resolve() };
  }

  let exporter: ConvexTraceExporter;
  try {
    exporter = new ConvexTraceExporter(env.LANGFUSE_PUBLIC_KEY, env.LANGFUSE_SECRET_KEY, env.LANGFUSE_BASE_URL);
  } catch {
    return { telemetry: undefined, flush: () => Promise.resolve() };
  }
  const processor = new LangfuseSpanProcessor({
    publicKey: env.LANGFUSE_PUBLIC_KEY,
    secretKey: env.LANGFUSE_SECRET_KEY,
    baseUrl: env.LANGFUSE_BASE_URL,
    exportMode: 'immediate',
    mediaUploadEnabled: false,
    exporter,
  });
  const provider = new TracerProvider({ spanProcessors: [processor] });
  const tracer = provider.getTracer('analyst');
  return {
    telemetry: {
      isEnabled: true,
      recordInputs: false,
      recordOutputs: false,
      integrations: new OpenTelemetry({
        tracer,
        enrichSpan: () => ({
          'langfuse.user.id': userId,
          'langfuse.session.id': threadId,
          'langfuse.trace.metadata.modelId': modelId,
        }),
      }),
    },
    flush: async () => {
      await processor.forceFlush();
      await provider.shutdown();
    },
  };
}
