import { expect, test } from 'vitest';
import { parsePendingDeletion } from './account-deletion-pending';

test('pending deletion belongs only to the account that confirmed it', () => {
  const pending = JSON.stringify({ userId: 'user_a', deletionExportId: null, feedback: { reason: 'privacy' } });
  expect(parsePendingDeletion(pending, 'user_a')).toEqual({ userId: 'user_a', deletionExportId: null, feedback: { reason: 'privacy' } });
  expect(parsePendingDeletion(pending, 'user_b')).toBeNull();
  expect(parsePendingDeletion('', 'user_b')).toBeNull();
  expect(parsePendingDeletion('{', 'user_a')).toBeNull();
  expect(parsePendingDeletion(JSON.stringify({ userId: 'user_a', deletionExportId: null }), 'user_a')).toBeNull();
});
