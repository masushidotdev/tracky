/// <reference types="vite/client" />

import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { convexTest } from 'convex-test';
import { makeFunctionReference } from 'convex/server';
import { describe, expect, test } from 'vitest';
import { components } from './_generated/api';
import schema from './schema';
import type { Doc, Id } from './_generated/dataModel';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const modules = import.meta.glob(['./_generated/*.js', './auth.ts', './banking/*.ts', './lib/*.ts']);

const transactionMeta = {
  listTags: makeFunctionReference<'query', Record<string, never>, Array<Doc<'transactionTags'>>>(
    'banking/transactionMeta:listTags',
  ),
  createTag: makeFunctionReference<'mutation', { name: string; color?: string }, Id<'transactionTags'>>(
    'banking/transactionMeta:createTag',
  ),
  renameTag: makeFunctionReference<'mutation', { tagId: Id<'transactionTags'>; name: string }, Id<'transactionTags'>>(
    'banking/transactionMeta:renameTag',
  ),
  setTagColor: makeFunctionReference<
    'mutation',
    { tagId: Id<'transactionTags'>; color?: string },
    Id<'transactionTags'>
  >('banking/transactionMeta:setTagColor'),
  deleteTag: makeFunctionReference<'mutation', { tagId: Id<'transactionTags'> }, Id<'transactionTags'>>(
    'banking/transactionMeta:deleteTag',
  ),
  setTransactionTags: makeFunctionReference<
    'mutation',
    { transactionId: Id<'transactions'>; tagIds: Array<Id<'transactionTags'>> },
    Id<'transactions'>
  >('banking/transactionMeta:setTransactionTags'),
  setTransactionHidden: makeFunctionReference<
    'mutation',
    { transactionId: Id<'transactions'>; hidden: boolean },
    Id<'transactions'>
  >('banking/transactionMeta:setTransactionHidden'),
  setTransactionNote: makeFunctionReference<
    'mutation',
    { transactionId: Id<'transactions'>; note: string },
    Id<'transactions'>
  >('banking/transactionMeta:setTransactionNote'),
  bulkSetTags: makeFunctionReference<
    'mutation',
    {
      transactionIds: Array<Id<'transactions'>>;
      addTagIds?: Array<Id<'transactionTags'>>;
      removeTagIds?: Array<Id<'transactionTags'>>;
    },
    { updated: number; skipped: Array<{ transactionId: Id<'transactions'>; reason: string }> }
  >('banking/transactionMeta:bulkSetTags'),
  bulkSetHidden: makeFunctionReference<
    'mutation',
    { transactionIds: Array<Id<'transactions'>>; hidden: boolean },
    { updated: number; skipped: Array<{ transactionId: Id<'transactions'>; reason: string }> }
  >('banking/transactionMeta:bulkSetHidden'),
};

function createTest() {
  const t = convexTest(schema, modules);
  workOSAuthKitTest.register(t);
  return t;
}

type TestHarness = ReturnType<typeof createTest>;

async function seedAuthKitUser(t: TestHarness, userId: string) {
  const timestamp = '2026-01-01T00:00:00.000Z';
  await t.mutation(components.workOSAuthKit.lib.onWebhookEvent, {
    apiKey: 'sk_test',
    event: {
      id: `evt_${userId}`,
      createdAt: timestamp,
      event: 'user.created',
      data: {
        object: 'user',
        id: userId,
        email: `${userId}@example.com`,
        firstName: 'Test',
        lastName: 'User',
        emailVerified: true,
        profilePictureUrl: null,
        lastSignInAt: null,
        externalId: null,
        metadata: {},
        locale: 'en-US',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    },
  });
}

async function seedUserData(t: TestHarness, userId: string, transactionCount = 1) {
  await seedAuthKitUser(t, userId);
  const ids = await t.run(async (ctx) => {
    const now = Date.UTC(2026, 6, 1);
    const providerConnectionId = await ctx.db.insert('providerConnections', {
      userId,
      provider: 'manual',
      status: 'active',
      displayName: 'Manual',
      createdAtMs: now,
      updatedAtMs: now,
    });
    const accountId = await ctx.db.insert('financialAccounts', {
      userId,
      providerConnectionId,
      provider: 'manual',
      name: `${userId} account`,
      currency: 'EUR',
      status: 'active',
      syncEnabled: false,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const transactionIds: Array<Id<'transactions'>> = [];
    for (let index = 0; index < transactionCount; index += 1) {
      transactionIds.push(
        await ctx.db.insert('transactions', {
          userId,
          accountId,
          providerConnectionId,
          provider: 'manual',
          dedupeKey: `${userId}|${index}`,
          status: 'BOOK',
          direction: 'DBIT',
          amount: { amountMinor: 100n, currency: 'EUR' },
          bookingDate: '2026-07-01',
          description: `Transaction ${index}`,
          classificationKind: 'expense',
          classificationSource: 'user',
          importedAtMs: now,
          updatedAtMs: now,
        }),
      );
    }
    return { accountId, providerConnectionId, transactionIds };
  });
  return { asUser: t.withIdentity({ subject: userId }), ...ids };
}

async function insertTags(t: TestHarness, userId: string, names: Array<string>) {
  return await t.run(async (ctx) => {
    const now = Date.UTC(2026, 6, 1);
    const ids: Array<Id<'transactionTags'>> = [];
    for (const name of names) {
      ids.push(
        await ctx.db.insert('transactionTags', {
          userId,
          name,
          createdAtMs: now,
          updatedAtMs: now,
        }),
      );
    }
    return ids;
  });
}

describe('transaction tags', () => {
  test('creates, lists, renames, colors, and case-insensitively deduplicates tags', async () => {
    const t = createTest();
    const fixture = await seedUserData(t, 'user_tags');
    const essentialsId = await fixture.asUser.mutation(transactionMeta.createTag, {
      name: '  Essentials  ',
      color: '#a1B2c3',
    });
    const leisureId = await fixture.asUser.mutation(transactionMeta.createTag, { name: 'Leisure' });

    await expect(fixture.asUser.mutation(transactionMeta.createTag, { name: 'ESSENTIALS' })).rejects.toThrow(
      'already exists',
    );
    await expect(
      fixture.asUser.mutation(transactionMeta.renameTag, { tagId: leisureId, name: ' essentials ' }),
    ).rejects.toThrow('already exists');
    await fixture.asUser.mutation(transactionMeta.renameTag, { tagId: leisureId, name: 'Fun' });
    await fixture.asUser.mutation(transactionMeta.setTagColor, { tagId: essentialsId, color: '#abcdef' });
    await fixture.asUser.mutation(transactionMeta.setTagColor, { tagId: essentialsId });

    const tags = await fixture.asUser.query(transactionMeta.listTags, {});
    expect(tags.map(({ name, color }) => ({ name, color }))).toEqual([
      { name: 'Essentials', color: undefined },
      { name: 'Fun', color: undefined },
    ]);
  });

  test('validates tag names, colors, and the 50-tag cap', async () => {
    const t = createTest();
    const fixture = await seedUserData(t, 'user_tag_limits');

    await expect(fixture.asUser.mutation(transactionMeta.createTag, { name: ' ' })).rejects.toThrow(
      'between 1 and 30',
    );
    await expect(
      fixture.asUser.mutation(transactionMeta.createTag, { name: 'x'.repeat(31) }),
    ).rejects.toThrow('between 1 and 30');
    await expect(
      fixture.asUser.mutation(transactionMeta.createTag, { name: 'Bad color', color: 'abcdef' }),
    ).rejects.toThrow('#rrggbb');

    const tagId = await fixture.asUser.mutation(transactionMeta.createTag, { name: 'First' });
    await expect(
      fixture.asUser.mutation(transactionMeta.setTagColor, { tagId, color: '#12345g' }),
    ).rejects.toThrow('#rrggbb');
    await insertTags(
      t,
      'user_tag_limits',
      Array.from({ length: 49 }, (_, index) => `Tag ${index + 2}`),
    );
    await expect(fixture.asUser.mutation(transactionMeta.createTag, { name: 'Too many' })).rejects.toThrow(
      'At most 50',
    );
  });

  test('deleting a tag leaves transaction references dangling but removes it from the list', async () => {
    const t = createTest();
    const fixture = await seedUserData(t, 'user_delete_tag');
    const tagId = await fixture.asUser.mutation(transactionMeta.createTag, { name: 'Temporary' });
    await fixture.asUser.mutation(transactionMeta.setTransactionTags, {
      transactionId: fixture.transactionIds[0],
      tagIds: [tagId],
    });

    await fixture.asUser.mutation(transactionMeta.deleteTag, { tagId });
    expect(await fixture.asUser.query(transactionMeta.listTags, {})).toEqual([]);
    const transaction = await t.run(async (ctx) => await ctx.db.get('transactions', fixture.transactionIds[0]));
    expect(transaction?.tagIds).toEqual([tagId]);
  });
});

describe('transaction metadata', () => {
  test('sets deduplicated owned tags and enforces ownership and the per-transaction cap', async () => {
    const t = createTest();
    const owner = await seedUserData(t, 'user_meta_owner');
    const other = await seedUserData(t, 'user_meta_other');
    const [tagA, tagB] = await insertTags(t, 'user_meta_owner', ['A', 'B']);
    const [foreignTag] = await insertTags(t, 'user_meta_other', ['Foreign']);

    await owner.asUser.mutation(transactionMeta.setTransactionTags, {
      transactionId: owner.transactionIds[0],
      tagIds: [tagA, tagA, tagB],
    });
    const transaction = await t.run(async (ctx) => await ctx.db.get('transactions', owner.transactionIds[0]));
    expect(transaction?.tagIds).toEqual([tagA, tagB]);

    await expect(
      owner.asUser.mutation(transactionMeta.setTransactionTags, {
        transactionId: owner.transactionIds[0],
        tagIds: [foreignTag],
      }),
    ).rejects.toThrow('Transaction tag not found');
    await expect(
      owner.asUser.mutation(transactionMeta.setTransactionTags, {
        transactionId: other.transactionIds[0],
        tagIds: [],
      }),
    ).rejects.toThrow('Transaction not found');

    const tooManyTags = await insertTags(
      t,
      'user_meta_owner',
      Array.from({ length: 11 }, (_, index) => `Limit ${index}`),
    );
    await expect(
      owner.asUser.mutation(transactionMeta.setTransactionTags, {
        transactionId: owner.transactionIds[0],
        tagIds: tooManyTags,
      }),
    ).rejects.toThrow('at most 10 tags');
  });

  test('trims, limits, and clears notes and updates the hidden flag', async () => {
    const t = createTest();
    const fixture = await seedUserData(t, 'user_note');
    const transactionId = fixture.transactionIds[0];

    await fixture.asUser.mutation(transactionMeta.setTransactionNote, {
      transactionId,
      note: '  Reimbursable lunch  ',
    });
    await fixture.asUser.mutation(transactionMeta.setTransactionHidden, { transactionId, hidden: true });
    let transaction = await t.run(async (ctx) => await ctx.db.get('transactions', transactionId));
    expect(transaction).toMatchObject({ note: 'Reimbursable lunch', hiddenFromReports: true });

    await expect(
      fixture.asUser.mutation(transactionMeta.setTransactionNote, { transactionId, note: 'x'.repeat(501) }),
    ).rejects.toThrow('at most 500');
    await fixture.asUser.mutation(transactionMeta.setTransactionNote, { transactionId, note: '   ' });
    await fixture.asUser.mutation(transactionMeta.setTransactionHidden, { transactionId, hidden: false });
    transaction = await t.run(async (ctx) => await ctx.db.get('transactions', transactionId));
    expect(transaction?.note).toBeUndefined();
    expect(transaction?.hiddenFromReports).toBe(false);
  });

  test('bulk tag updates merge, remove, skip rows over the cap, and bulk-set hidden', async () => {
    const t = createTest();
    const fixture = await seedUserData(t, 'user_bulk', 3);
    const tags = await insertTags(
      t,
      'user_bulk',
      ['Remove', 'Add A', 'Add B', ...Array.from({ length: 9 }, (_, index) => `Existing ${index}`)],
    );
    const [removeTag, addA, addB, ...existing] = tags;
    await t.run(async (ctx) => {
      await ctx.db.patch('transactions', fixture.transactionIds[0], { tagIds: [removeTag, ...existing] });
      await ctx.db.patch('transactions', fixture.transactionIds[1], { tagIds: [removeTag, addA] });
    });

    const result = await fixture.asUser.mutation(transactionMeta.bulkSetTags, {
      transactionIds: fixture.transactionIds,
      addTagIds: [addA, addB, addA],
      removeTagIds: [removeTag],
    });
    expect(result).toEqual({
      updated: 2,
      skipped: [{ transactionId: fixture.transactionIds[0], reason: 'Tag limit exceeded' }],
    });

    const transactions = await t.run(async (ctx) =>
      Promise.all(fixture.transactionIds.map((transactionId) => ctx.db.get('transactions', transactionId))),
    );
    expect(transactions[0]?.tagIds).toEqual([removeTag, ...existing]);
    expect(transactions[1]?.tagIds).toEqual([addA, addB]);
    expect(transactions[2]?.tagIds).toEqual([addA, addB]);

    expect(
      await fixture.asUser.mutation(transactionMeta.bulkSetHidden, {
        transactionIds: [fixture.transactionIds[0], fixture.transactionIds[0], fixture.transactionIds[2]],
        hidden: true,
      }),
    ).toEqual({ updated: 2, skipped: [] });
    const hidden = await t.run(async (ctx) =>
      Promise.all(fixture.transactionIds.map((transactionId) => ctx.db.get('transactions', transactionId))),
    );
    expect(hidden.map((transaction) => transaction?.hiddenFromReports)).toEqual([true, undefined, true]);
  });

  test('bulk operations reject transactions and added tags owned by another user', async () => {
    const t = createTest();
    const owner = await seedUserData(t, 'user_bulk_owner');
    const other = await seedUserData(t, 'user_bulk_other');
    const [foreignTag] = await insertTags(t, 'user_bulk_other', ['Foreign']);

    await expect(
      owner.asUser.mutation(transactionMeta.bulkSetTags, {
        transactionIds: [other.transactionIds[0]],
        addTagIds: [],
      }),
    ).rejects.toThrow('Transaction not found');
    await expect(
      owner.asUser.mutation(transactionMeta.bulkSetTags, {
        transactionIds: owner.transactionIds,
        addTagIds: [foreignTag],
      }),
    ).rejects.toThrow('Transaction tag not found');
    await expect(
      owner.asUser.mutation(transactionMeta.bulkSetHidden, {
        transactionIds: [other.transactionIds[0]],
        hidden: true,
      }),
    ).rejects.toThrow('Transaction not found');
  });
});

describe('transaction metadata auth', () => {
  test('requires authentication for every public function', async () => {
    const t = createTest();
    const fixture = await seedUserData(t, 'user_auth');
    const [tagId] = await insertTags(t, 'user_auth', ['Auth']);
    const transactionId = fixture.transactionIds[0];

    const calls = [
      () => t.query(transactionMeta.listTags, {}),
      () => t.mutation(transactionMeta.createTag, { name: 'New' }),
      () => t.mutation(transactionMeta.renameTag, { tagId, name: 'Renamed' }),
      () => t.mutation(transactionMeta.setTagColor, { tagId, color: '#abcdef' }),
      () => t.mutation(transactionMeta.deleteTag, { tagId }),
      () => t.mutation(transactionMeta.setTransactionTags, { transactionId, tagIds: [tagId] }),
      () => t.mutation(transactionMeta.setTransactionHidden, { transactionId, hidden: true }),
      () => t.mutation(transactionMeta.setTransactionNote, { transactionId, note: 'Note' }),
      () => t.mutation(transactionMeta.bulkSetTags, { transactionIds: [transactionId], addTagIds: [tagId] }),
      () => t.mutation(transactionMeta.bulkSetHidden, { transactionIds: [transactionId], hidden: true }),
    ];

    for (const call of calls) {
      await expect(call()).rejects.toThrow('Unauthorized');
    }
  });
});
