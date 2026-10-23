/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
test('the production capability probe signs and verifies with Web Crypto in the edge runtime', async () => {
  const t = convexTest(schema, modules);
  expect(await t.action(internal.securityRuntime.verifyCapabilities, {})).toEqual({
    rsaSignatureVerified: true,
    stateBytes: 24,
    telemetrySerialized: true,
  });
});
