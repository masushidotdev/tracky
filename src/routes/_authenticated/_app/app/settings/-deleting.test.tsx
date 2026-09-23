// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { DeletingRoute } from './deleting';
import type { Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => {
  const query = vi.fn();
  return {
    query,
    convex: { query },
    mutation: vi.fn(),
    clearSession: vi.fn(),
    trackEvent: vi.fn(),
    navigate: vi.fn(),
  };
});

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
  useNavigate: () => mocks.navigate,
}));
vi.mock('convex/react', () => ({
  useConvex: () => mocks.convex,
  useMutation: () => mocks.mutation,
}));
vi.mock('@workos/authkit-tanstack-react-start/client', () => ({
  useAuth: () => ({ user: { id: 'confirmed_user' }, loading: false }),
}));
vi.mock('@/lib/account-deletion-signout', () => ({ clearDeletedAccountSession: mocks.clearSession }));
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/analytics/events', () => ({
  resetAnalyticsUser: vi.fn(),
  trackEvent: mocks.trackEvent,
  analyticsEvents: {
    accountDeletionFeedbackSubmitted: 'account_deletion_feedback_submitted',
    accountDeletionRequested: 'account_deletion_requested',
  },
}));

let root: Root | null = null;
let container: HTMLElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.useRealTimers();
  window.sessionStorage.clear();
});

test('a completed deletion clears the local session when marker cleanup throws', async () => {
  mocks.query.mockResolvedValue({ status: 'done', currentStep: 'workos' });
  mocks.clearSession.mockResolvedValue(undefined);
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
    throw new Error('storage unavailable');
  });

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<DeletingRoute />);
    await Promise.resolve();
  });

  expect(mocks.clearSession).toHaveBeenCalledOnce();
  expect(container.textContent).not.toContain('settings.deleting.connectionError');
});

test('a failed session cleanup keeps the page with a retry instead of navigating home', async () => {
  window.sessionStorage.setItem('tracky.deletionStarted', 'confirmed_user');
  window.sessionStorage.setItem('tracky.deletionPending', JSON.stringify({
    userId: 'confirmed_user',
    deletionExportId: null,
    feedback: { reason: 'privacy' },
  }));
  mocks.query.mockResolvedValue({ status: 'done', currentStep: 'done' });
  mocks.clearSession.mockRejectedValueOnce(new Error('cleanup unavailable')).mockResolvedValue(undefined);

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<DeletingRoute />);
    await Promise.resolve();
  });

  expect(mocks.clearSession).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain('settings.deleting.signOutFailed');
  expect(window.sessionStorage.getItem('tracky.deletionStarted')).toBe('confirmed_user');

  await act(async () => {
    container?.querySelector('button')?.click();
    await Promise.resolve();
  });

  expect(mocks.clearSession).toHaveBeenCalledTimes(2);
  expect(container.textContent).not.toContain('settings.deleting.signOutFailed');
  expect(window.sessionStorage.getItem('tracky.deletionStarted')).toBeNull();
});

test('a remount with a matching started marker skips resubmission and polls status', async () => {
  window.sessionStorage.setItem('tracky.deletionStarted', 'confirmed_user');
  window.sessionStorage.setItem('tracky.deletionPending', JSON.stringify({
    userId: 'confirmed_user',
    deletionExportId: null,
    feedback: { reason: 'privacy' },
  }));
  mocks.query.mockResolvedValue({ status: 'wiping', currentStep: 'disconnect' });

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<DeletingRoute />);
    await Promise.resolve();
  });

  expect(mocks.mutation).not.toHaveBeenCalled();
  expect(container.textContent).toContain('settings.deleting.closeTab');
});

test('an unreadable pending marker does not send the user back to Settings', async () => {
  mocks.query.mockResolvedValue(null);
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('storage unavailable');
  });

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<DeletingRoute />);
    await Promise.resolve();
  });

  expect(mocks.navigate).not.toHaveBeenCalled();
  expect(container.textContent).not.toContain('settings.deleting.connectionError');
});

test('the pending request starts once after storage reads recover', async () => {
  vi.useFakeTimers();
  mocks.query.mockResolvedValue(null);
  mocks.mutation.mockResolvedValue(undefined);
  let available = false;
  const pending = JSON.stringify({ userId: 'confirmed_user', deletionExportId: null, feedback: { reason: 'privacy' } });
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => {
    if (!available) throw new Error('storage unavailable');
    return key === 'tracky.deletionPending' ? pending : null;
  });

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<DeletingRoute />);
    await Promise.resolve();
  });
  expect(mocks.mutation).not.toHaveBeenCalled();

  available = true;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(4_000);
  });
  expect(mocks.mutation).toHaveBeenCalledTimes(1);
  expect(mocks.mutation).toHaveBeenCalledWith({
    deletionExportId: undefined,
    feedback: { reason: 'privacy' },
  });
  expect(mocks.trackEvent).toHaveBeenCalledWith('account_deletion_feedback_submitted', {
    reason: 'privacy', has_other_text: false,
  }, { sendBeacon: true });
});

test('a missing status clears the local session when deletion previously started', async () => {
  window.sessionStorage.setItem('tracky.deletionStarted', 'confirmed_user');
  mocks.query.mockResolvedValue(null);
  mocks.clearSession.mockResolvedValue(undefined);

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<DeletingRoute />);
    await Promise.resolve();
  });

  expect(mocks.clearSession).toHaveBeenCalledOnce();
  expect(mocks.navigate).not.toHaveBeenCalled();
});

test('a missing status clears the local session despite an unreadable pending marker', async () => {
  window.sessionStorage.setItem('tracky.deletionStarted', 'confirmed_user');
  mocks.query.mockResolvedValue(null);
  mocks.clearSession.mockResolvedValue(undefined);
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => {
    if (key === 'tracky.deletionPending') throw new Error('storage unavailable');
    return key === 'tracky.deletionStarted' ? 'confirmed_user' : null;
  });

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<DeletingRoute />);
    await Promise.resolve();
  });

  expect(mocks.clearSession).toHaveBeenCalledOnce();
  expect(mocks.navigate).not.toHaveBeenCalled();
});
