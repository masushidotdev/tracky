import { LangfuseSpanProcessor } from '@langfuse/otel';
import { JsonTraceSerializer } from '@opentelemetry/otlp-transformer';
import { TracerProvider } from '@opentelemetry/sdk-trace';
import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { createBankingState, createEnableBankingJwt } from './banking/enableBankingCrypto';

// Operator-only evidence from the same runtime used by banking and Analyst actions.
export const inspect = internalAction({
  args: {},
  returns: v.object({
    runtime: v.union(v.literal('convex'), v.literal('node')),
    nodeVersion: v.union(v.string(), v.null()),
    networkTransport: v.literal('fetch'),
    bankingCrypto: v.literal('WebCrypto'),
  }),
  handler: () => {
    const runtimeProcess = (globalThis as { process?: { versions?: { node?: string } } }).process;
    const nodeVersion = runtimeProcess?.versions?.node ?? null;
    return Promise.resolve({
      runtime: nodeVersion ? ('node' as const) : ('convex' as const),
      nodeVersion,
      networkTransport: 'fetch' as const,
      bankingCrypto: 'WebCrypto' as const,
    });
  },
});

// Synthetic, read-only probe: no provider calls, customer data or configured signing keys.
export const verifyCapabilities = internalAction({
  args: {},
  returns: v.object({ rsaSignatureVerified: v.boolean(), stateBytes: v.number(), telemetrySerialized: v.boolean() }),
  handler: async () => {
    const keys = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );
    const bytes = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keys.privateKey));
    const pem = [
      '-----BEGIN ' + 'PRIVATE KEY-----',
      btoa(String.fromCharCode(...bytes)),
      '-----END ' + 'PRIVATE KEY-----',
    ].join('\n');
    const jwt = await createEnableBankingJwt('synthetic-runtime-check', pem);
    const [header, payload, signature] = jwt.split('.');
    const signatureBytes = Uint8Array.from(atob(signature.replace(/-/g, '+').replace(/_/g, '/')), (value) =>
      value.charCodeAt(0),
    );
    // Exercise the actual Langfuse/OTel packages without external requests or real credentials.
    let telemetryBytes = 0;
    const processor = new LangfuseSpanProcessor({
      publicKey: 'synthetic-runtime-probe',
      secretKey: 'synthetic-runtime-probe',
      exportMode: 'immediate',
      mediaUploadEnabled: false,
      exporter: {
        export: (spans, callback) => {
          telemetryBytes += JsonTraceSerializer.serializeRequest(spans)?.byteLength ?? 0;
          callback({ code: 0 });
        },
        shutdown: () => Promise.resolve(),
      },
    });
    const provider = new TracerProvider({ spanProcessors: [processor] });
    provider
      .getTracer('runtime-probe')
      .startSpan('synthetic chat', {
        attributes: { 'gen_ai.operation.name': 'chat' },
      })
      .end();
    await provider.forceFlush();
    await provider.shutdown();
    return {
      telemetrySerialized: telemetryBytes > 0,
      rsaSignatureVerified: await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        keys.publicKey,
        signatureBytes,
        new TextEncoder().encode(`${header}.${payload}`),
      ),
      stateBytes: atob(createBankingState().replace(/-/g, '+').replace(/_/g, '/')).length,
    };
  },
});
