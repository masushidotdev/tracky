import type { MutationCtx } from '../_generated/server';

export type FirstMilestoneDecision = 'emit' | 'backfill' | 'skip';

export type FirstTransactionSource = 'csv' | 'manual' | 'bank';

export type OnboardingMilestoneDecisions = {
  signup?: FirstMilestoneDecision;
  firstCsvImport?: FirstMilestoneDecision;
  firstPlan?: FirstMilestoneDecision;
  firstTransaction?: FirstMilestoneDecision;
  firstBankAccount?: FirstMilestoneDecision;
};

export type PendingClientMilestoneQueue = {
  firstBankAccountConnected?: boolean;
  firstTransactionBank?: boolean;
};

/**
 * Pure idempotency rule for one-time onboarding funnel milestones.
 *
 * - `alreadyMarked === true` -> `'skip'` (never emit again, never rewrite).
 * - `alreadyMarked === false && hadPriorData === true` -> `'backfill'`
 *   (persist the flag silently so pre-existing users never fire a fake "first").
 * - `alreadyMarked === false && hadPriorData === false` -> `'emit'`
 *   (caller has just created the first item; persist the flag and emit once).
 */
export function shouldEmitFirstMilestone(args: {
  alreadyMarked: boolean;
  hadPriorData: boolean;
}): FirstMilestoneDecision {
  if (args.alreadyMarked) {
    return 'skip';
  }
  if (args.hadPriorData) {
    return 'backfill';
  }
  return 'emit';
}

/**
 * Pure idempotency rule for the one-time `signup_completed` milestone.
 *
 * Delegates to `shouldEmitFirstMilestone`: an account is treated as newly signed
 * up only when `signupAtMs` is not yet persisted and the user has no prior
 * financial data (`financialAccounts`, `transactions`, `plans`) and no prior
 * onboarding milestone markers. A bare `userSettings` row (e.g., notification
 * preferences saved before consent) without financial data or prior milestones
 * still qualifies as new.
 */
export function shouldEmitSignupMilestone(args: {
  alreadyMarked: boolean;
  hasFinancialAccounts: boolean;
  hasTransactions: boolean;
  hasPlans: boolean;
  hasPriorMilestones?: boolean;
}): FirstMilestoneDecision {
  return shouldEmitFirstMilestone({
    alreadyMarked: args.alreadyMarked,
    hadPriorData:
      args.hasFinancialAccounts ||
      args.hasTransactions ||
      args.hasPlans ||
      Boolean(args.hasPriorMilestones),
  });
}

export function hasPriorOnboardingMilestones(
  milestones:
    | {
        firstCsvImportAtMs?: number;
        firstPlanAtMs?: number;
        firstTransactionAtMs?: number;
        firstBankAccountAtMs?: number;
      }
    | undefined,
): boolean {
  if (!milestones) return false;
  return (
    milestones.firstCsvImportAtMs !== undefined ||
    milestones.firstPlanAtMs !== undefined ||
    milestones.firstTransactionAtMs !== undefined ||
    milestones.firstBankAccountAtMs !== undefined
  );
}

export async function getUserSettingsByUserId(ctx: MutationCtx, userId: string) {
  return await ctx.db
    .query('userSettings')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .unique();
}

export async function hasPriorUserFinancialAccount(ctx: MutationCtx, userId: string): Promise<boolean> {
  const existing = await ctx.db
    .query('financialAccounts')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .first();
  return existing !== null;
}

export async function hasPriorUserPlan(ctx: MutationCtx, userId: string): Promise<boolean> {
  const existing = await ctx.db
    .query('plans')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .first();
  return existing !== null;
}

export async function hasPriorUserTransaction(ctx: MutationCtx, userId: string): Promise<boolean> {
  const existing = await ctx.db
    .query('transactions')
    .withIndex('by_userId_and_bookingDate', (q) => q.eq('userId', userId))
    .first();
  return existing !== null;
}

/**
 * Checks whether a user already has any CSV-imported transaction (`dedupeKey`
 * prefixed with `csv|`) across their manual accounts using the existing
 * `by_accountId_and_dedupeKey` index. Only called when `firstCsvImportAtMs`
 * is not yet persisted on `userSettings`.
 */
export async function hasPriorUserCsvTransaction(ctx: MutationCtx, userId: string): Promise<boolean> {
  const accounts = await ctx.db
    .query('financialAccounts')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .take(200);
  for (const account of accounts) {
    if (account.provider !== 'manual') continue;
    const csvRow = await ctx.db
      .query('transactions')
      .withIndex('by_accountId_and_dedupeKey', (q) =>
        q.eq('accountId', account._id).gte('dedupeKey', 'csv|').lt('dedupeKey', 'csv}'),
      )
      .first();
    if (csvRow !== null) {
      return true;
    }
  }
  return false;
}

export async function persistOnboardingMilestones(
  ctx: MutationCtx,
  args: {
    userId: string;
    nowMs: number;
    decisions: OnboardingMilestoneDecisions;
    queueClientEvents?: PendingClientMilestoneQueue;
  },
): Promise<void> {
  const shouldWriteSignup = args.decisions.signup === 'emit' || args.decisions.signup === 'backfill';
  const shouldWriteCsv =
    args.decisions.firstCsvImport === 'emit' || args.decisions.firstCsvImport === 'backfill';
  const shouldWritePlan = args.decisions.firstPlan === 'emit' || args.decisions.firstPlan === 'backfill';
  const shouldWriteTx =
    args.decisions.firstTransaction === 'emit' || args.decisions.firstTransaction === 'backfill';
  const shouldWriteBank =
    args.decisions.firstBankAccount === 'emit' || args.decisions.firstBankAccount === 'backfill';

  const queueBankAccount = Boolean(args.queueClientEvents?.firstBankAccountConnected);
  const queueBankTx = Boolean(args.queueClientEvents?.firstTransactionBank);

  if (
    !shouldWriteSignup &&
    !shouldWriteCsv &&
    !shouldWritePlan &&
    !shouldWriteTx &&
    !shouldWriteBank &&
    !queueBankAccount &&
    !queueBankTx
  ) {
    return;
  }

  const existing = await getUserSettingsByUserId(ctx, args.userId);
  const current = existing?.onboardingMilestones ?? {};
  const currentPending = current.pendingClientEvents;

  const nextPending =
    queueBankAccount || queueBankTx || currentPending
      ? {
          ...currentPending,
          ...(queueBankAccount ? { firstBankAccountConnected: true } : {}),
          ...(queueBankTx ? { firstTransactionBank: true } : {}),
        }
      : undefined;

  const nextMilestones = {
    ...current,
    ...(shouldWriteSignup && current.signupAtMs === undefined ? { signupAtMs: args.nowMs } : {}),
    ...(shouldWriteCsv && current.firstCsvImportAtMs === undefined ? { firstCsvImportAtMs: args.nowMs } : {}),
    ...(shouldWritePlan && current.firstPlanAtMs === undefined ? { firstPlanAtMs: args.nowMs } : {}),
    ...(shouldWriteTx && current.firstTransactionAtMs === undefined ? { firstTransactionAtMs: args.nowMs } : {}),
    ...(shouldWriteBank && current.firstBankAccountAtMs === undefined ? { firstBankAccountAtMs: args.nowMs } : {}),
    ...(nextPending ? { pendingClientEvents: nextPending } : {}),
  };

  if (existing) {
    await ctx.db.patch('userSettings', existing._id, {
      onboardingMilestones: nextMilestones,
      updatedAtMs: args.nowMs,
    });
    return;
  }

  await ctx.db.insert('userSettings', {
    userId: args.userId,
    onboardingMilestones: nextMilestones,
    createdAtMs: args.nowMs,
    updatedAtMs: args.nowMs,
  });
}
