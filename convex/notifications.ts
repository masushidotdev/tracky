import { ConvexError, v } from 'convex/values';
import { makeFunctionReference } from 'convex/server';
import { internal } from './_generated/api';
import { internalAction, internalMutation, internalQuery, mutation, query } from './_generated/server';
import { requireAuthUser } from './auth';
import { currentPeriod } from './banking/planActivity';
import { activePlanForUser, computePlanMonthState } from './banking/planRead';
import { addRecurringInterval } from './banking/subscriptionDetection';
import { absoluteMinorUnits, minorUnitFactor } from './lib/money';
import { notificationTypeValidator } from './lib/validators';
import { isAccountDeletionStarted } from './lib/accountDeletionGuard';
import type { Doc, Id } from './_generated/dataModel';

type NotificationType = Doc<'notifications'>['type'];
type NotificationSeverity = Doc<'notifications'>['severity'];
type NotificationParams = Record<string, string | number>;

type NotificationCandidate = {
  userId: string;
  type: NotificationType;
  severity: NotificationSeverity;
  titleKey: string;
  bodyKey: string;
  params: NotificationParams;
  dedupeKey: string;
};

const deliverNotificationsRef = makeFunctionReference<
  'action',
  { notificationIds: Array<Id<'notifications'>> },
  null
>('notificationDelivery:deliverNotifications');

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIsoDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function daysFromDate(fromDate: string, toDate: string) {
  const fromMs = new Date(`${fromDate}T00:00:00.000Z`).getTime();
  const toMs = new Date(`${toDate}T00:00:00.000Z`).getTime();
  return Math.round((toMs - fromMs) / (24 * 60 * 60 * 1_000));
}

function majorUnitString(amount: { amountMinor: bigint; currency: string }) {
  const factor = minorUnitFactor(amount.currency);
  const negative = amount.amountMinor < 0n;
  const absoluteMinor = absoluteMinorUnits(amount.amountMinor);
  const whole = absoluteMinor / factor;
  if (factor === 1n) {
    return `${negative ? '-' : ''}${whole}`;
  }
  const fractionDigits = factor.toString().length - 1;
  const fraction = (absoluteMinor % factor).toString().padStart(fractionDigits, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

function nextPlannedExpenseOccurrence(expense: Doc<'plannedTransactions'>, asOfDate: string) {
  let dueDate = expense.dueDate.slice(0, 10);
  if (!expense.recurrenceInterval) {
    return dueDate;
  }

  const intervalCount = expense.recurrenceIntervalCount ?? 1;
  for (let guard = 0; guard < 240 && dueDate < asOfDate; guard += 1) {
    dueDate = addRecurringInterval(dueDate, expense.recurrenceInterval, intervalCount);
  }
  return dueDate;
}

export const listNotificationUserIds = internalQuery({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 200, 500);
    const userIds = new Set<string>();

    const syncStates = await ctx.db.query('accountSyncStates').withIndex('by_userId').take(limit);
    for (const syncState of syncStates) {
      userIds.add(syncState.userId);
    }

    const plans = await ctx.db.query('plans').withIndex('by_userId').take(limit);
    for (const plan of plans) {
      userIds.add(plan.userId);
    }

    const subscriptions = await ctx.db
      .query('subscriptions')
      .withIndex('by_userId')
      .take(limit);
    for (const subscription of subscriptions) {
      userIds.add(subscription.userId);
    }

    const installmentPlans = await ctx.db
      .query('creditFacilityInstallmentPlans')
      .withIndex('by_userId')
      .take(limit);
    for (const plan of installmentPlans) {
      userIds.add(plan.userId);
    }

    for (const kind of ['expense', 'income'] as const) {
      const plannedExpenses = await ctx.db
        .query('plannedTransactions')
        .withIndex('by_kind', (q) => q.eq('kind', kind))
        .take(limit);
      for (const expense of plannedExpenses) {
        userIds.add(expense.userId);
      }
    }

    return [...userIds].slice(0, limit);
  },
});

export const collectCandidatesForUser = internalQuery({
  args: {
    userId: v.string(),
    asOfDate: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Array<NotificationCandidate>> => {
    const asOfDate = args.asOfDate ?? todayIsoDate();
    const horizonDate = addDaysIsoDate(asOfDate, 7);
    const period = currentPeriod();
    const candidates: Array<NotificationCandidate> = [];

    const settings = await ctx.db
      .query('userSettings')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .unique();
    const billReminderLeadDays = [...(settings?.notifications?.billReminderLeadDays ?? [3])].sort(
      (left, right) => left - right,
    );

    if (billReminderLeadDays.length > 0) {
      const maxLeadDays = billReminderLeadDays[billReminderLeadDays.length - 1];
      const billReminderHorizonDate = addDaysIsoDate(asOfDate, maxLeadDays);
      const expensesById = new Map<Id<'plannedTransactions'>, Doc<'plannedTransactions'>>();

      for (const status of ['planned', 'funding'] as const) {
        for (const kind of ['expense', 'income'] as const) {
          const upcomingExpenses = await ctx.db
            .query('plannedTransactions')
            .withIndex('by_userId_and_kind_and_status_and_dueDate', (q) =>
              q
                .eq('userId', args.userId)
                .eq('kind', kind)
                .eq('status', status)
                .gte('dueDate', asOfDate)
                .lte('dueDate', billReminderHorizonDate),
            )
            .take(100);
          const recurringExpensesWithPastAnchor = await ctx.db
            .query('plannedTransactions')
            .withIndex('by_userId_and_kind_and_status_and_dueDate', (q) =>
              q.eq('userId', args.userId).eq('kind', kind).eq('status', status).lt('dueDate', asOfDate),
            )
            .order('desc')
            .take(100);

          for (const expense of upcomingExpenses) {
            expensesById.set(expense._id, expense);
          }
          for (const expense of recurringExpensesWithPastAnchor) {
            if (expense.recurrenceInterval) {
              expensesById.set(expense._id, expense);
            }
          }
        }
      }

      for (const expense of expensesById.values()) {
        const dueDate = nextPlannedExpenseOccurrence(expense, asOfDate);
        if (dueDate < asOfDate || dueDate > billReminderHorizonDate) {
          continue;
        }

        const daysUntilDue = daysFromDate(asOfDate, dueDate);
        const leadDay = billReminderLeadDays.find((candidateLeadDay) => daysUntilDue <= candidateLeadDay);
        if (leadDay === undefined) {
          continue;
        }

        const occurrencePayment = await ctx.db
          .query('plannedExpenseOccurrencePayments')
          .withIndex('by_plannedTransactionId_and_dueDate', (q) =>
            q.eq('plannedTransactionId', expense._id).eq('dueDate', dueDate),
          )
          .unique();
        if (occurrencePayment?.status === 'paid') {
          continue;
        }

        candidates.push({
          userId: args.userId,
          type: 'billReminder',
          severity: 'info',
          titleKey: 'notifications.billReminder.title',
          bodyKey: 'notifications.billReminder.body',
          params: {
            name: expense.name,
            date: dueDate,
            amount: majorUnitString(expense.amount),
            currency: expense.amount.currency,
          },
          dedupeKey: `billReminder:${expense._id}:${dueDate}:${leadDay}`,
        });
      }
    }

    const plan = await activePlanForUser(ctx, args.userId);
    if (plan) {
      const { rows, bucketStates } = await computePlanMonthState(ctx, plan, period);
      const groupById = new Map(rows.groups.map((group) => [group._id, group]));
      const stateByBucketId = new Map(bucketStates.map((state) => [state.bucketId, state]));

      for (const bucket of rows.buckets) {
        const state = stateByBucketId.get(bucket._id);
        const group = groupById.get(bucket.groupId);
        if (!state || bucket.hidden || group?.hidden || state.snoozed) continue;

        const spentMinor = state.activityMinor < 0n ? -state.activityMinor : 0n;
        const fundedMinor = state.availableEndMinor - state.activityMinor;
        const percent =
          fundedMinor > 0n ? Number((spentMinor * 100n) / fundedMinor) : state.availableEndMinor < 0n ? 100 : 0;
        const overspent = state.availableEndMinor < 0n;
        if (!overspent && percent < 90) continue;

        const threshold = overspent ? 'overspent' : 'near';
        candidates.push({
          userId: args.userId,
          type: 'budgetOverspend',
          severity: overspent ? 'critical' : 'warning',
          titleKey: overspent ? 'notifications.plan.overspent.title' : 'notifications.plan.near.title',
          bodyKey: overspent ? 'notifications.plan.overspent.body' : 'notifications.plan.near.body',
          params: {
            bucket: bucket.name,
            percent,
            period,
          },
          dedupeKey: `plan:${plan._id}:${period}:${bucket._id}:${threshold}`,
        });
      }
    }

    const subscriptions = await ctx.db
      .query('subscriptions')
      .withIndex('by_userId_and_nextDueDate', (q) =>
        q.eq('userId', args.userId).gte('nextDueDate', asOfDate).lte('nextDueDate', horizonDate),
      )
      .take(50);
    for (const subscription of subscriptions) {
      if (subscription.status !== 'active' || !subscription.nextDueDate) {
        continue;
      }

      candidates.push({
        userId: args.userId,
        type: 'upcomingPayment',
        severity: 'info',
        titleKey: 'notifications.payment.subscription.title',
        bodyKey: 'notifications.payment.subscription.body',
        params: {
          name: subscription.alias ?? subscription.name,
          date: subscription.nextDueDate,
        },
        dedupeKey: `subscription:${subscription._id}:${subscription.nextDueDate}`,
      });
    }

    const installmentPlans = await ctx.db
      .query('creditFacilityInstallmentPlans')
      .withIndex('by_userId_and_status', (q) => q.eq('userId', args.userId).eq('status', 'active'))
      .take(100);
    for (const installmentPlan of installmentPlans) {
      if (
        !installmentPlan.nextPaymentDate ||
        installmentPlan.nextPaymentDate < asOfDate ||
        installmentPlan.nextPaymentDate > horizonDate
      ) {
        continue;
      }

      const facility = await ctx.db.get('creditFacilities', installmentPlan.creditFacilityId);
      if (!facility || facility.userId !== args.userId) {
        continue;
      }

      candidates.push({
        userId: args.userId,
        type: 'upcomingPayment',
        severity: 'info',
        titleKey: 'notifications.payment.installment.title',
        bodyKey: 'notifications.payment.installment.body',
        params: {
          name: installmentPlan.name,
          facility: facility.name,
          date: installmentPlan.nextPaymentDate,
        },
        dedupeKey: `installment:${installmentPlan._id}:${installmentPlan.nextPaymentDate}`,
      });
    }

    const cashflow: {
      firstNegativeDate?: string;
      accountGroups: Array<{
        account?: { alias?: string | null; name: string };
        firstNegativeDate?: string;
      }>;
    } = await ctx.runQuery(internal.banking.planning.getPlanningCashflowViewForUser, {
      userId: args.userId,
      cycleOffset: 0,
      limit: 100,
      asOfDate,
    });
    if (cashflow.firstNegativeDate) {
      const group = cashflow.accountGroups.find((item) => item.firstNegativeDate === cashflow.firstNegativeDate);
      candidates.push({
        userId: args.userId,
        type: 'lowProjectedBalance',
        severity: 'critical',
        titleKey: 'notifications.cashflow.negative.title',
        bodyKey: 'notifications.cashflow.negative.body',
        params: {
          account: group?.account?.alias ?? group?.account?.name ?? 'Account',
          date: cashflow.firstNegativeDate,
        },
        dedupeKey: `cashflow:negative:${cashflow.firstNegativeDate}`,
      });
    }

    const syncStates = await ctx.db
      .query('accountSyncStates')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .take(100);
    for (const syncState of syncStates) {
      if (syncState.status !== 'error' && syncState.status !== 'reauthorizationRequired') {
        continue;
      }

      const account = await ctx.db.get('financialAccounts', syncState.accountId);
      if (!account || account.userId !== args.userId) {
        continue;
      }

      candidates.push({
        userId: args.userId,
        type: 'syncFailed',
        severity: syncState.status === 'reauthorizationRequired' ? 'warning' : 'critical',
        titleKey:
          syncState.status === 'reauthorizationRequired'
            ? 'notifications.sync.reauth.title'
            : 'notifications.sync.failed.title',
        bodyKey:
          syncState.status === 'reauthorizationRequired'
            ? 'notifications.sync.reauth.body'
            : 'notifications.sync.failed.body',
        params: {
          account: account.alias ?? account.name,
        },
        dedupeKey: `sync:${syncState.accountId}:${syncState.status}`,
      });
    }

    return candidates;
  },
});

export const upsertCandidates = internalMutation({
  args: {
    candidates: v.array(
      v.object({
        userId: v.string(),
        type: notificationTypeValidator,
        severity: v.union(v.literal('info'), v.literal('warning'), v.literal('critical')),
        titleKey: v.string(),
        bodyKey: v.string(),
        params: v.record(v.string(), v.union(v.string(), v.number())),
        dedupeKey: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let inserted = 0;
    let updated = 0;
    const insertedIds: Array<Id<'notifications'>> = [];
    const deletionState = new Map<string, boolean>();

    for (const candidate of args.candidates) {
      let deleting = deletionState.get(candidate.userId);
      if (deleting === undefined) {
        deleting = await isAccountDeletionStarted(ctx, candidate.userId);
        deletionState.set(candidate.userId, deleting);
      }
      if (deleting) continue;

      const existing = await ctx.db
        .query('notifications')
        .withIndex('by_userId_and_dedupeKey', (q) =>
          q.eq('userId', candidate.userId).eq('dedupeKey', candidate.dedupeKey),
        )
        .unique();

      if (existing) {
        await ctx.db.patch('notifications', existing._id, {
          type: candidate.type,
          severity: candidate.severity,
          titleKey: candidate.titleKey,
          bodyKey: candidate.bodyKey,
          params: candidate.params,
        });
        updated += 1;
        continue;
      }

      const notificationId = await ctx.db.insert('notifications', {
        ...candidate,
        createdAtMs: now,
      });
      insertedIds.push(notificationId);
      inserted += 1;
    }

    return { inserted, updated, insertedIds };
  },
});

export const evaluateNotifications = internalAction({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userIds: Array<string> = await ctx.runQuery(internal.notifications.listNotificationUserIds, {
      limit: args.limit,
    });
    let inserted = 0;
    let updated = 0;

    for (const userId of userIds) {
      const candidates: Array<NotificationCandidate> = await ctx.runQuery(
        internal.notifications.collectCandidatesForUser,
        { userId },
      );
      if (candidates.length === 0) {
        continue;
      }

      const result: { inserted: number; updated: number; insertedIds: Array<Id<'notifications'>> } = await ctx.runMutation(
        internal.notifications.upsertCandidates,
        { candidates },
      );
      inserted += result.inserted;
      updated += result.updated;
      if (result.insertedIds.length > 0) {
        await ctx.scheduler.runAfter(0, deliverNotificationsRef, { notificationIds: result.insertedIds });
      }
    }

    return { inserted, updated, usersChecked: userIds.length };
  },
});

export const getInbox = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const limit = Math.min(args.limit ?? 20, 50);
    const notifications = await ctx.db
      .query('notifications')
      .withIndex('by_userId_and_createdAtMs', (q) => q.eq('userId', user.id))
      .order('desc')
      .take(limit);
    const unreadCount = notifications.filter((notification) => notification.readAtMs === undefined).length;

    return {
      unreadCount,
      notifications,
    };
  },
});

export const markRead = mutation({
  args: {
    notificationId: v.id('notifications'),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const notification = await ctx.db.get('notifications', args.notificationId);
    if (!notification || notification.userId !== user.id) {
      throw new ConvexError('Notification not found');
    }

    await ctx.db.patch('notifications', notification._id, {
      readAtMs: notification.readAtMs ?? Date.now(),
    });
    return notification._id;
  },
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuthUser(ctx);
    const now = Date.now();
    const notifications = await ctx.db
      .query('notifications')
      .withIndex('by_userId_and_createdAtMs', (q) => q.eq('userId', user.id))
      .order('desc')
      .take(100);
    let updated = 0;

    for (const notification of notifications) {
      if (notification.readAtMs !== undefined) {
        continue;
      }

      await ctx.db.patch('notifications', notification._id, {
        readAtMs: now,
      });
      updated += 1;
    }

    return { updated };
  },
});
