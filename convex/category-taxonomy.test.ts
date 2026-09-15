/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { DEFAULT_CATEGORIES, ensureDefaultCategoriesForUser, inferCategorySystemKey } from './banking/categoryTaxonomy';
import schema from './schema';

const modules = import.meta.glob(['./_generated/*.js', './banking/categoryTaxonomy.ts']);

describe('category taxonomy', () => {
  test('defines the shared defaults once with neutral keys and all transaction kinds', () => {
    const requestedKeys = [
      'category:deposits',
      'category:gift',
      'category:services',
      'category:cashback',
      'category:savings',
      'category:donations',
      'category:remittances',
    ];

    for (const systemKey of requestedKeys) {
      const matches = DEFAULT_CATEGORIES.filter((category) => category.systemKey === systemKey);
      expect(matches).toHaveLength(1);
      expect(matches[0]?.applicableKinds).toEqual(['expense', 'income', 'transfer']);
    }
  });

  test('seeds shared defaults idempotently for an existing user', async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      await ensureDefaultCategoriesForUser(ctx, 'user_test');
      await ensureDefaultCategoriesForUser(ctx, 'user_test');
    });

    const categories = await t.run(async (ctx) =>
      ctx.db
        .query('categories')
        .withIndex('by_userId', (q) => q.eq('userId', 'user_test'))
        .collect(),
    );
    expect(categories).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(categories.find((category) => category.systemKey === 'category:gift')).toMatchObject({
      name: 'Gift',
      applicableKinds: ['expense', 'income', 'transfer'],
    });
  });

  test('infers cashback to the shared category for either direction', () => {
    expect(inferCategorySystemKey({ direction: 'CRDT', description: 'Card cashback' })).toBe('category:cashback');
    expect(inferCategorySystemKey({ direction: 'DBIT', description: 'Cashback adjustment' })).toBe('category:cashback');
  });
});
