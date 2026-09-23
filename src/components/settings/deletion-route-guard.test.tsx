// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { DeletionRouteGuard } from './deletion-route-guard';
import type { Root } from 'react-dom/client';
import { deletionPendingKey, deletionStartedKey } from '@/lib/account-deletion-pending';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => () => Promise.resolve(),
  useRouterState: () => false,
}));
vi.mock('convex/react', () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useQuery: () => null,
}));
vi.mock('@workos/authkit-tanstack-react-start/client', () => ({
  useAuth: () => ({ user: { id: 'confirmed_user' }, loading: false }),
}));
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/ui/spinner', () => ({ Spinner: () => <span>spinner</span> }));

let root: Root | null = null;
let container: HTMLElement | null = null;

function renderGuard() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<DeletionRouteGuard><div>normal app</div></DeletionRouteGuard>));
  return container;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

test('normal app stays unmounted during a pending or accepted deletion', () => {
  window.sessionStorage.setItem(deletionPendingKey, JSON.stringify({
    userId: 'confirmed_user', deletionExportId: null,
  }));
  const element = renderGuard();
  expect(element.textContent).not.toContain('normal app');
  act(() => {
    window.sessionStorage.removeItem(deletionPendingKey);
    window.sessionStorage.setItem(deletionStartedKey, 'confirmed_user');
    root?.render(<DeletionRouteGuard><div>normal app</div></DeletionRouteGuard>);
  });
  expect(element.textContent).not.toContain('normal app');
  act(() => {
    window.sessionStorage.removeItem(deletionStartedKey);
    root?.render(<DeletionRouteGuard><div>normal app</div></DeletionRouteGuard>);
  });
  expect(element.textContent).toContain('normal app');
});

test('a pending marker for another account does not redirect the current user', () => {
  window.sessionStorage.setItem(deletionPendingKey, JSON.stringify({
    userId: 'other_user', deletionExportId: null,
  }));
  expect(renderGuard().textContent).toContain('normal app');
});

test('storage failures block ordinary screens and retry when storage recovers', () => {
  const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('storage unavailable');
  });
  const element = renderGuard();
  expect(element.textContent).toContain('settings.deleting.storageUnavailable');
  expect(element.textContent).not.toContain('normal app');
  read.mockRestore();
  act(() => (element.querySelector('button') as HTMLButtonElement).click());
  expect(element.textContent).toContain('normal app');
});
