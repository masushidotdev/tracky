// @vitest-environment jsdom

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { DeletionRouteGuard } from './deletion-route-guard';
import { deletionPendingKey, deletionStartedKey } from '@/lib/account-deletion-pending';

const route = vi.hoisted(() => ({ deleting: false }));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => () => Promise.resolve(),
  useRouterState: () => route.deleting,
}));
vi.mock('convex/react', () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useQuery: () => null,
}));
vi.mock('@workos/authkit-tanstack-react-start/client', () => ({
  useAuth: () => ({ user: { id: 'confirmed_user' } }),
}));
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/ui/spinner', () => ({ Spinner: () => <span>spinner</span> }));

afterEach(() => window.sessionStorage.clear());

function renderGuard() {
  return renderToStaticMarkup(<DeletionRouteGuard><div>normal app</div></DeletionRouteGuard>);
}

test('normal app stays unmounted while a confirmed deletion request is pending', () => {
  window.sessionStorage.setItem(deletionPendingKey, JSON.stringify({
    userId: 'confirmed_user', deletionExportId: null,
  }));
  expect(renderGuard()).not.toContain('normal app');
  window.sessionStorage.removeItem(deletionPendingKey);
  window.sessionStorage.setItem(deletionStartedKey, 'confirmed_user');
  expect(renderGuard()).not.toContain('normal app');
  window.sessionStorage.removeItem(deletionStartedKey);
  expect(renderGuard()).toContain('normal app');
});
