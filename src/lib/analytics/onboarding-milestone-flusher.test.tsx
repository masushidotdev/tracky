// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { getFunctionName } from 'convex/server';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { api } from '../../../convex/_generated/api';
import { ANALYTICS_CONSENT_EVENT, analyticsEvents } from './events';
import { OnboardingMilestoneFlusher } from './onboarding-milestone-flusher';
import type { FunctionReference } from 'convex/server';
import type { Mock } from 'vitest';
import type * as EventsModule from './events';
import type { Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type FlusherTestMocks = {
  config: {
    enabled: boolean;
    key: string | undefined;
    apiHost: string | undefined;
    appEnv: string;
    replaySampleRate: number;
  };
  consent: 'unknown' | 'accepted' | 'rejected';
  ready: boolean;
  settings: Record<string, unknown> | undefined;
  useAuthedQuerySpy: Mock<(queryRef: unknown, args: unknown) => void>;
  claimPending: Mock<() => Promise<{ firstBankAccountConnected: boolean; firstTransactionBank: boolean }>>;
  claimSignup: Mock<() => Promise<{ emit: boolean }>>;
  trackEvent: Mock<(...args: Array<unknown>) => void>;
};

const mocks: FlusherTestMocks = vi.hoisted(() => ({
  config: {
    enabled: true,
    key: 'phc_test',
    apiHost: 'https://e.trytracky.app',
    appEnv: 'test',
    replaySampleRate: 1,
  },
  consent: 'accepted',
  ready: true,
  settings: {
    userId: 'user_1',
    planTier: 'free',
    notifications: { billReminderLeadDays: [3], emailEnabled: false, telegramEnabled: false },
  },
  useAuthedQuerySpy: vi.fn(),
  claimPending: vi.fn(),
  claimSignup: vi.fn(),
  trackEvent: vi.fn(),
}));

vi.mock('@/hooks/use-authed-query', () => ({
  useAuthedQuery: (queryRef: unknown, args: unknown) => {
    mocks.useAuthedQuerySpy(queryRef, args);
    return args === 'skip' ? undefined : mocks.settings;
  },
}));

vi.mock('convex/react', () => ({
  useMutation: (mutationRef: FunctionReference<'mutation'>) => {
    if (getFunctionName(mutationRef) === 'userSettings:claimSignupMilestone') {
      return mocks.claimSignup;
    }
    return mocks.claimPending;
  },
}));

vi.mock('./events', async () => {
  const actual = await vi.importActual<typeof EventsModule>('./events');
  return {
    ...actual,
    getAnalyticsConfigSnapshot: () => mocks.config,
    readConsent: () => mocks.consent,
    isAnalyticsReady: () => mocks.ready,
    trackEvent: (...args: Array<unknown>) => mocks.trackEvent(...args),
  };
});

let root: Root | null = null;
let container: HTMLElement | null = null;

function mountFlusher() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<OnboardingMilestoneFlusher />);
  });
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  mocks.config = {
    enabled: true,
    key: 'phc_test',
    apiHost: 'https://e.trytracky.app',
    appEnv: 'test',
    replaySampleRate: 1,
  };
  mocks.consent = 'accepted';
  mocks.ready = true;
  mocks.settings = {
    userId: 'user_1',
    planTier: 'free',
    notifications: { billReminderLeadDays: [3], emailEnabled: false, telegramEnabled: false },
  };
  mocks.claimPending.mockResolvedValue({ firstBankAccountConnected: false, firstTransactionBank: false });
  mocks.claimSignup.mockResolvedValue({ emit: true });
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('OnboardingMilestoneFlusher', () => {
  test('stays completely silent when analytics is unconfigured (self-hosted)', async () => {
    vi.useFakeTimers();
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    mocks.config = {
      enabled: false,
      key: undefined,
      apiHost: undefined,
      appEnv: 'production',
      replaySampleRate: 1,
    };

    mountFlusher();
    await flushMicrotasks();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(mocks.useAuthedQuerySpy).toHaveBeenCalledWith(api.userSettings.getMySettings, 'skip');
    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect(mocks.claimSignup).not.toHaveBeenCalled();
    expect(mocks.claimPending).not.toHaveBeenCalled();
    expect(mocks.trackEvent).not.toHaveBeenCalled();
    setIntervalSpy.mockRestore();
  });

  test('never calls mutations or polls when consent is rejected', async () => {
    vi.useFakeTimers();
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    mocks.consent = 'rejected';
    mocks.ready = false;

    mountFlusher();
    await flushMicrotasks();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect(mocks.claimSignup).not.toHaveBeenCalled();
    expect(mocks.claimPending).not.toHaveBeenCalled();
    expect(mocks.trackEvent).not.toHaveBeenCalled();
    setIntervalSpy.mockRestore();
  });

  test('claims signup once per session and emits signup_completed when ready analytics returns emit:true', async () => {
    mountFlusher();
    await flushMicrotasks();

    expect(mocks.claimSignup).toHaveBeenCalledTimes(1);
    expect(mocks.claimSignup).toHaveBeenCalledWith({});
    expect(mocks.trackEvent).toHaveBeenCalledTimes(1);
    expect(mocks.trackEvent).toHaveBeenCalledWith(analyticsEvents.signupCompleted, {
      surface: 'app_bootstrap',
    });

    // Re-rendering during the same session never re-calls claimSignup.
    act(() => {
      root?.render(<OnboardingMilestoneFlusher />);
    });
    await flushMicrotasks();
    expect(mocks.claimSignup).toHaveBeenCalledTimes(1);
    expect(mocks.trackEvent).toHaveBeenCalledTimes(1);
  });

  test('does not emit signup_completed when claimSignupMilestone returns emit:false', async () => {
    mocks.claimSignup.mockResolvedValueOnce({ emit: false });

    mountFlusher();
    await flushMicrotasks();

    expect(mocks.claimSignup).toHaveBeenCalledTimes(1);
    expect(mocks.trackEvent).not.toHaveBeenCalled();
  });

  test('skips claimSignupMilestone when signupAtMs is already persisted on userSettings', async () => {
    mocks.settings = {
      userId: 'user_returning',
      planTier: 'free',
      onboardingMilestones: { signupAtMs: 1_700_000_000_000 },
    };

    mountFlusher();
    await flushMicrotasks();

    expect(mocks.claimSignup).not.toHaveBeenCalled();
    expect(mocks.trackEvent).not.toHaveBeenCalled();
  });

  test('waits while consent is unknown, then claims and emits once after consent is accepted', async () => {
    vi.useFakeTimers();
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    mocks.consent = 'unknown';
    mocks.ready = false;

    mountFlusher();
    await flushMicrotasks();
    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect(mocks.claimSignup).not.toHaveBeenCalled();

    // User accepts consent; SDK becomes ready.
    mocks.consent = 'accepted';
    mocks.ready = true;
    act(() => {
      window.dispatchEvent(new Event(ANALYTICS_CONSENT_EVENT));
    });
    await flushMicrotasks();

    expect(mocks.claimSignup).toHaveBeenCalledTimes(1);
    expect(mocks.trackEvent).toHaveBeenCalledTimes(1);
    expect(mocks.trackEvent).toHaveBeenCalledWith(analyticsEvents.signupCompleted, {
      surface: 'app_bootstrap',
    });
    setIntervalSpy.mockRestore();
  });
});
