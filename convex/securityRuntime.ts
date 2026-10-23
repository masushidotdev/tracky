'use node';

import { v } from 'convex/values';
import { internalAction } from './_generated/server';

// Operator-only runtime evidence. No environment values or credentials are returned.
// The version baseline cannot attest provider patch provenance or exclude compromise.
export const inspect = internalAction({
  args: {},
  returns: v.object({
    nodeVersion: v.string(),
    brotliVersion: v.union(v.string(), v.null()),
    meetsNode22Baseline: v.boolean(),
  }),
  handler: () => {
    const [major, minor, patch] = process.versions.node.split('.').map(Number);
    return Promise.resolve({
      nodeVersion: process.versions.node,
      brotliVersion: process.versions.brotli ?? null,
      meetsNode22Baseline: major === 22 && (minor > 23 || (minor === 23 && patch >= 4)),
    });
  },
});
