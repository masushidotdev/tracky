import posthog from 'posthog-js';

// Analytics event names. snake_case, domain-prefixed. Never add PII,
// amounts, notes, account names, IBANs, emails, or chat text to properties.
export const analyticsEvents = {
  landingViewed: 'landing_viewed',
  signupStarted: 'signup_started',
  signinStarted: 'signin_started',
  signupCompleted: 'signup_completed',
  loginCompleted: 'login_completed',
  onboardingEmptyStateViewed: 'onboarding_empty_state_viewed',
  dashboardViewed: 'dashboard_viewed',
  safeToSpendOpened: 'safe_to_spend_opened',
  kpiClicked: 'kpi_clicked',
  planBucketCreated: 'plan_bucket_created',
  planAutoAssignRun: 'plan_auto_assign_run',
  planMonthChanged: 'plan_month_changed',
  transactionCategorized: 'transaction_categorized',
  transactionTagged: 'transaction_tagged',
  transferMatched: 'transfer_matched',
  subscriptionSuggestionAccepted: 'subscription_suggestion_accepted',
  subscriptionSuggestionRejected: 'subscription_suggestion_rejected',
  plannedExpenseCreated: 'planned_expense_created',
  plannedExpensePaid: 'planned_expense_paid',
  moneyBoxCreated: 'money_box_created',
  moneyBoxFunded: 'money_box_funded',
  moneyBoxWithdrawn: 'money_box_withdrawn',
  plannedTransferCreated: 'planned_transfer_created',
  reportViewed: 'report_viewed',
  savedReportCreated: 'saved_report_created',
  forecastInitialized: 'forecast_initialized',
  scenarioCreated: 'scenario_created',
  lifeEventAdded: 'life_event_added',
  goalCreated: 'goal_created',
  goalContributionAdded: 'goal_contribution_added',
  subscriptionCreated: 'subscription_created',
  subscriptionStatusChanged: 'subscription_status_changed',
  manualAccountCreated: 'manual_account_created',
  bankConnectionStarted: 'bank_connection_started',
  bankConnectionCompleted: 'bank_connection_completed',
  bankConnectionFailed: 'bank_connection_failed',
  balanceUpdated: 'balance_updated',
  csvImportStarted: 'csv_import_started',
  csvImportCompleted: 'csv_import_completed',
  csvImportFailed: 'csv_import_failed',
  creditFacilityCreated: 'credit_facility_created',
  installmentPlanCreated: 'installment_plan_created',
  loanCreated: 'loan_created',
  loanDeleted: 'loan_deleted',
  statementCycleClosed: 'statement_cycle_closed',
  analystOpened: 'analyst_opened',
  analystMessageSent: 'analyst_message_sent',
  docsArticleViewed: 'docs_article_viewed',
  notificationPrefsUpdated: 'notification_prefs_updated',
  dataExportRequested: 'data_export_requested',
  accountDeletionRequested: 'account_deletion_requested',
  accountDeletionCancelled: 'account_deletion_cancelled',
  trackingConsentChanged: 'tracking_consent_changed',
  commandMenuOpened: 'command_menu_opened',
  notificationOpened: 'notification_opened',
  upgradeCtaClicked: 'upgrade_cta_clicked',
  // Impression-only until the paywall ships: the CTA button is disabled, so
  // mounts record a view, never a click (keeps conversion data clean).
  upgradeCtaViewed: 'upgrade_cta_viewed',
  errorShown: 'error_shown',
} as const;

export type AnalyticsEventName = (typeof analyticsEvents)[keyof typeof analyticsEvents];

export type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

const CONSENT_KEY = 'tracky.analytics-consent';

// Normalize dynamic route segments so pageviews never leak ids:
// /app/loans/abc123 -> /app/loans/:id
const DYNAMIC_SEGMENT_PREFIXES = ['/app/loans/', '/app/accounts/', '/app/docs/'] as const;

export function normalizeRouteId(pathname: string): string {
  for (const prefix of DYNAMIC_SEGMENT_PREFIXES) {
    if (pathname.startsWith(prefix) && pathname.length > prefix.length) {
      return `${prefix.slice(0, -1)}/:id`;
    }
  }

  return pathname;
}

// Defense-in-depth for SDK-added URL props: posthog-js attaches $current_url,
// $pathname, $host etc. to every capture even with autocapture off, so the
// before_send hook rewrites them to the normalized route id (no raw Convex
// ids, query, hash, or referrer ever leaves the browser). Generic so both the
// SDK's CaptureResult and unit-test fixtures satisfy the parameter type.
export function sanitizeEventUrls<T extends { properties?: Record<string, unknown> | null }>(
  event: T | null,
): T | null {
  if (!event || !event.properties) return event;
  const props = event.properties;
  const rawPath = typeof props.$pathname === 'string' ? props.$pathname : null;
  const routeId = rawPath ? normalizeRouteId(rawPath.split('?')[0].split('#')[0]) : null;
  if (routeId) {
    props.$pathname = routeId;
    if (typeof props.$current_url === 'string') {
      try {
        const url = new URL(props.$current_url);
        props.$current_url = `${url.origin}${routeId}`;
      } catch {
        props.$current_url = routeId;
      }
    }
  } else {
    delete props.$current_url;
    delete props.$pathname;
  }
  delete props.$referrer;
  delete props.$referring_domain;
  return event;
}

export type ConsentState = 'unknown' | 'accepted' | 'rejected';

export function readConsent(): ConsentState {
  if (typeof window === 'undefined') return 'unknown';
  const stored = window.localStorage.getItem(CONSENT_KEY);
  if (stored === 'accepted' || stored === 'rejected') return stored;
  return 'unknown';
}

type AnalyticsConfig = {
  enabled: boolean;
  key: string | undefined;
  apiHost: string | undefined;
  appEnv: string;
  replaySampleRate: number;
};

function readConfig(): AnalyticsConfig {
  // Strict opt-in: only the exact string 'true' enables capture. Unset or
  // anything else (incl. 'false') is a silent no-op.
  const enabled = import.meta.env.VITE_POSTHOG_ENABLED === 'true';
  const replaySampleRate = Number(import.meta.env.VITE_POSTHOG_REPLAY_SAMPLE ?? '1');
  return {
    enabled,
    key: import.meta.env.VITE_POSTHOG_KEY,
    apiHost: import.meta.env.VITE_POSTHOG_API_HOST,
    appEnv: import.meta.env.VITE_POSTHOG_ENV ?? import.meta.env.MODE ?? 'development',
    replaySampleRate: Number.isFinite(replaySampleRate) ? Math.min(1, Math.max(0, replaySampleRate)) : 1,
  };
}

let initialized = false;
let identifyPendingUserId: string | null = null;

function isTestEnv(): boolean {
  return typeof process !== 'undefined' && process.env.VITEST === 'true';
}

function canTrack(): boolean {
  if (typeof window === 'undefined') return false;
  if (isTestEnv()) return false;
  if (!initialized) return false;
  if (readConsent() !== 'accepted') return false;
  return !posthog.has_opted_out_capturing();
}

export function getAnalyticsConfigSnapshot(): AnalyticsConfig {
  return readConfig();
}

// Public readiness probe for one-shot view effects: true only when a
// trackEvent/trackPageview call would actually capture right now.
export function isAnalyticsReady(): boolean {
  return canTrack();
}

export function initAnalytics(): void {
  if (typeof window === 'undefined') return;
  if (initialized) return;
  if (isTestEnv()) return;

  const config = readConfig();
  // Missing key/host is a silent no-op in every environment: throwing in dev
  // would crash the app for contributors without analytics configured.
  if (!config.enabled || !config.key || !config.apiHost) return;
  // Never load the SDK before the user accepts.
  if (readConsent() !== 'accepted') return;

  // Manual pageviews only (SPA + autocapture would leak financial PII).
  // opt_out_capturing_by_default: double-guarantee — SDK-level opt-out on top
  // of our localStorage gate, so no beacon precedes an explicit accept.
  posthog.init(config.key, {
    api_host: config.apiHost,
    ui_host: 'https://eu.posthog.com',
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    opt_out_capturing_by_default: true,
    before_send: sanitizeEventUrls,
    // Consent-gated: opt-in banner accepted before init, so recording starts
    // immediately at the configured sample rate (user decision: 1.0).
    // Revocation calls reset().
    disable_session_recording: false,
    session_recording: {
      // Financial data: mask every input, mask known-sensitive blocks.
      maskAllInputs: true,
      maskTextSelector: '[data-ph-mask], [data-amount], [data-balance]',
      blockSelector: '[data-ph-block]',
      sampleRate: config.replaySampleRate,
    },
    // Single EU project for staging+prod: app_env/host separate the traffic.
    loaded: (instance) => {
      instance.opt_in_capturing();
      instance.register({ app_env: config.appEnv });
      if (identifyPendingUserId) {
        instance.identify(identifyPendingUserId);
        identifyPendingUserId = null;
      }
    },
  });
  initialized = true;
}

export function setAnalyticsConsent(accepted: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CONSENT_KEY, accepted ? 'accepted' : 'rejected');
  if (accepted) {
    // initAnalytics may no-op when the SDK is already loaded (e.g. re-accept
    // after revocation): opt in explicitly so capture resumes.
    initAnalytics();
    if (initialized) posthog.opt_in_capturing();
    trackEvent(analyticsEvents.trackingConsentChanged, { value: 'accepted' });
  } else if (initialized) {
    trackEvent(analyticsEvents.trackingConsentChanged, { value: 'rejected' });
    posthog.opt_out_capturing();
  }
}

export function identifyAnalyticsUser(workosUserId: string | null): void {
  if (!workosUserId) return;
  if (typeof window === 'undefined') return;
  if (readConsent() !== 'accepted') {
    // Consent may arrive after login: remember, identify on init.
    identifyPendingUserId = workosUserId;
    return;
  }
  if (!initialized) {
    identifyPendingUserId = workosUserId;
    initAnalytics();
    return;
  }
  // Post-logout the SDK is opted out (see resetAnalyticsUser): re-opt-in
  // before identifying, otherwise identify() is a silent no-op.
  posthog.opt_in_capturing();
  posthog.register({ app_env: readConfig().appEnv });
  posthog.identify(workosUserId);
}

export function resetAnalyticsUser(): void {
  identifyPendingUserId = null;
  if (initialized && typeof window !== 'undefined') {
    // Consent-gated app: logout always revokes capture too (fresh opt-in on
    // next login via identifyPendingUserId + init path). With
    // opt_out_capturing_by_default, reset() alone would silently re-opt-out.
    posthog.reset();
    posthog.opt_out_capturing();
  }
}

export function trackPageview(pathname: string, extra?: AnalyticsProperties): void {
  if (!canTrack()) return;
  // route_id only: the raw pathname can embed Convex ids (/app/loans/abc123),
  // so it must never leave the browser. Protected fields go after `extra`
  // so callers cannot override them.
  posthog.capture('$pageview', {
    ...extra,
    route_id: normalizeRouteId(pathname),
  });
}

export function trackEvent(
  event: AnalyticsEventName,
  properties?: AnalyticsProperties,
  options?: { sendBeacon?: boolean },
): void {
  if (!canTrack()) return;
  // sendBeacon: flush via navigator.sendBeacon for events fired right before a
  // full-page navigation (WorkOS redirect) that would otherwise drop them.
  posthog.capture(event, properties, options?.sendBeacon ? { transport: 'sendBeacon' } : undefined);
}

// Bucket helpers so properties stay PII-free enums.
export function countBucket(count: number): string {
  if (count <= 1) return '1';
  if (count <= 10) return '2-10';
  if (count <= 50) return '11-50';
  return '50+';
}

export function lengthBucket(length: number): string {
  if (length <= 50) return '0-50';
  if (length <= 200) return '51-200';
  if (length <= 1000) return '201-1000';
  return '1000+';
}
