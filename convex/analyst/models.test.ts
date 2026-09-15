// @vitest-environment node

import { describe, expect, test } from 'vitest';
import { DEFAULT_MODEL, SELECTABLE_MODELS, modelIdValidator } from './models';

describe('analyst model allowlist', () => {
  test('matches the literals accepted by the Convex validator', () => {
    const json = (
      modelIdValidator as unknown as { json: { type: string; value: Array<{ type: string; value: string }> } }
    ).json;
    expect(json.type).toBe('union');
    expect(json.value.map((item) => item.value)).toEqual(SELECTABLE_MODELS);
    expect(SELECTABLE_MODELS).toContain(DEFAULT_MODEL);
  });
});
