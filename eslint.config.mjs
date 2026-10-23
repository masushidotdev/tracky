import { defineConfig, globalIgnores } from 'eslint/config';
import { tanstackConfig } from '@tanstack/eslint-config';
import convexPlugin from '@convex-dev/eslint-plugin';

export default defineConfig([
  ...tanstackConfig,
  ...convexPlugin.configs.recommended,
  // Test fixtures deliberately set/unset process.env to exercise fail-closed configuration.
  { files: ['convex/**/*.test.ts'], rules: { '@convex-dev/no-process-env': 'off' } },
  // Prefix indexes can have different creation-time ordering and existing cursors.
  // Retain this schema during the security update; index consolidation needs its own migration audit.
  { files: ['convex/schema.ts'], rules: { '@convex-dev/no-duplicate-indexes': 'off' } },
  globalIgnores(['convex/_generated', '.agents/**', '.content-collections/**']),
]);
