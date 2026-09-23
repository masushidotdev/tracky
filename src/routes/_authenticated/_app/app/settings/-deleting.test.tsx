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
    signOut: vi.fn(),
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
  useAuth: () => ({ signOut: mocks.signOut, user: { id: 'confirmed_user' }, loading: false }),
}));
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/analytics/events', () => ({ resetAnalyticsUser: vi.fn() }));

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

test('a completed deletion still signs out when marker cleanup throws', async () => {
  mocks.query.mockResolvedValue({ status: 'done', currentStep: 'workos' });
  mocks.signOut.mockResolvedValue(undefined);
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

  expect(mocks.signOut).toHaveBeenCalledWith({ returnTo: '/' });
  expect(container.textContent).not.toContain('settings.deleting.connectionError');
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
  const pending = JSON.stringify({ userId: 'confirmed_user', deletionExportId: null });
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
});
