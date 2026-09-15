import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';
import { SYNC_DISPATCH_INTERVAL_MINUTES } from './banking/syncCadence';

const crons = cronJobs();

crons.interval(
  'sync connected bank accounts',
  { minutes: SYNC_DISPATCH_INTERVAL_MINUTES },
  internal.banking.enableBanking.syncDueAccounts,
  {
    limit: 20,
  },
);
crons.interval('evaluate finance notifications', { hours: 6 }, internal.notifications.evaluateNotifications, {
  limit: 200,
});

// Recovery only: the normal path is scheduled directly by the dispatchers, so
// this just reclaims leases that expired. Runs every 5 minutes because once a
// minute it was the single largest consumer of the deployment's database I/O.
crons.interval('recover proactive analyst jobs', { minutes: 5 }, internal.analyst.proactive.jobs.watchdogProactiveJobs, {
  limit: 20,
});
crons.cron('auto close card statement cycles', '13 3 * * *', internal.banking.credit.autoCloseDueUsageCycles, {
  limit: 200,
});
crons.cron(
  'promote due scheduled transactions',
  '7 3 * * *',
  internal.banking.scheduledTransactions.promoteDueScheduledTransactions,
  { limit: 200 },
);
crons.cron('compute analyst health scores', '30 5 * * *', internal.analyst.proactive.jobs.dispatchHealthScores, {
  cursor: null,
});
crons.cron('detect analyst spending anomalies', '15 6 * * *', internal.analyst.proactive.jobs.dispatchSpendingAnomalies, {
  cursor: null,
});
crons.cron('generate analyst monthly reports', '0 6 2 * *', internal.analyst.proactive.jobs.dispatchMonthlyReports, {
  cursor: null,
});
crons.cron('review analyst subscriptions', '30 6 3 * *', internal.analyst.proactive.jobs.dispatchSubscriptionReviews, {
  cursor: null,
});
crons.interval('cleanup analyst report emails', { hours: 24 }, internal.analyst.emails.cleanupResendEmails, {});
crons.cron('cleanup expired data exports', '20 3 * * *', internal.dataExport.cleanupExpiredExports, {});
// Recovery only: `acceptUpdate` enqueues the worker immediately and retries
// reschedule themselves, so this only picks up updates whose lease expired.
crons.interval('recover Telegram Analyst updates', { minutes: 5 }, internal.analyst.telegram.watchdogTelegramUpdates, {
  limit: 20,
});
crons.interval('cleanup Telegram link codes', { hours: 1 }, internal.analyst.telegram.cleanupTelegramLinkCodes, {
  limit: 100,
});
crons.interval('cleanup Telegram Analyst updates', { hours: 24 }, internal.analyst.telegram.cleanupTelegramUpdates, {
  limit: 100,
  retentionDays: 30,
});

export default crons;
