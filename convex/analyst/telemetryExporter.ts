import { ExportResultCode } from '@opentelemetry/core';
import { JsonTraceSerializer } from '@opentelemetry/otlp-transformer';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace';

const MAX_EXPORT_BYTES = 1_000_000;

/** OTLP JSON over the standard runtime's fetch; no Node HTTP, gzip or browser XHR. */
export class ConvexTraceExporter implements SpanExporter {
  private readonly pending = new Set<Promise<void>>();
  private closed = false;
  private readonly url: URL;

  constructor(
    private readonly publicKey: string,
    private readonly secretKey: string,
    baseUrl = 'https://cloud.langfuse.com',
  ) {
    this.url = new URL(baseUrl);
    if (this.url.protocol !== 'https:' || this.url.username || this.url.password || this.url.search || this.url.hash) {
      throw new Error('Langfuse requires an HTTPS base URL without embedded credentials');
    }
    this.url.pathname = `${this.url.pathname.replace(/\/$/, '')}/api/public/otel/v1/traces`;
  }

  export(spans: Array<ReadableSpan>, callback: Parameters<SpanExporter['export']>[1]): void {
    if (this.closed) {
      callback({ code: ExportResultCode.FAILED, error: new Error('Telemetry exporter is closed') });
      return;
    }
    const work = this.send(spans).then(
      () => callback({ code: ExportResultCode.SUCCESS }),
      () => callback({ code: ExportResultCode.FAILED, error: new Error('Telemetry export failed') }),
    );
    this.pending.add(work);
    void work.then(
      () => this.pending.delete(work),
      () => this.pending.delete(work),
    );
  }

  private async send(spans: Array<ReadableSpan>): Promise<void> {
    const body = JsonTraceSerializer.serializeRequest(spans);
    if (!body) throw new Error('Telemetry serialization failed');
    if (body.byteLength > MAX_EXPORT_BYTES) {
      if (spans.length < 2) throw new Error('Telemetry span exceeds export limit');
      const middle = Math.floor(spans.length / 2);
      await this.send(spans.slice(0, middle));
      await this.send(spans.slice(middle));
      return;
    }
    const response = await fetch(this.url, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(5_000),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${btoa(`${this.publicKey}:${this.secretKey}`)}`,
        'x-langfuse-sdk-name': 'javascript',
        'x-langfuse-public-key': this.publicKey,
        'x-langfuse-ingestion-version': '4',
      },
      body: new TextDecoder().decode(body),
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error('Telemetry ingestion rejected the batch');
  }

  async forceFlush(): Promise<void> {
    await Promise.all(this.pending);
  }

  async shutdown(): Promise<void> {
    this.closed = true;
    await this.forceFlush();
  }
}
