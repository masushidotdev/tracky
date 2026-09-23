// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { ProfileBootstrap } from './profile-bootstrap';
import type { Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({ ensureProfile: vi.fn() }));
vi.mock('convex/react', () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useMutation: () => mocks.ensureProfile,
}));
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/ui/spinner', () => ({ Spinner: () => <span>spinner</span> }));

let root: Root | null = null;
let container: HTMLElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.useRealTimers();
  vi.clearAllMocks();
});

test('waits for AuthKit sync before mounting app queries, then opens without reload', async () => {
  vi.useFakeTimers();
  mocks.ensureProfile.mockResolvedValueOnce(null).mockResolvedValueOnce('profile_id');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <ProfileBootstrap>
        <div>app queries mounted</div>
      </ProfileBootstrap>,
    );
  });
  await act(async () => { await Promise.resolve(); });
  expect(container.textContent).toContain('auth.profileSyncWaiting');
  expect(container.textContent).not.toContain('app queries mounted');

  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
  expect(mocks.ensureProfile).toHaveBeenCalledTimes(2);
  expect(container.textContent).toContain('app queries mounted');
});
