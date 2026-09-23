import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import {
  bankProviderValidator,
  classificationKindValidator,
  classificationSourceValidator,
  connectionStatusValidator,
  creditFacilityPlanStatusValidator,
  creditFacilityRepaymentTypeValidator,
  creditFacilityStatusValidator,
  creditFacilityTypeValidator,
  creditFacilityUsageCycleStatusValidator,
  forecastChangeModeValidator,
  forecastLifeEventValidator,
  importJobStatusValidator,
  metadataValidator,
  moneyAmountValidator,
  notificationTypeValidator,
  recurrenceIntervalValidator,
  savedReportConfigValidator,
  transactionDirectionValidator,
  transactionStatusValidator,
  userProfileStatusValidator,
} from './lib/validators';

export default defineSchema({
  userProfiles: defineTable({
    authUserId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    emailVerified: v.optional(v.boolean()),
    profilePictureUrl: v.optional(v.string()),
    externalId: v.optional(v.string()),
    locale: v.optional(v.string()),
    status: userProfileStatusValidator,
    workosCreatedAt: v.optional(v.string()),
    workosUpdatedAt: v.optional(v.string()),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
    lastSyncedAtMs: v.number(),
    deletedAtMs: v.optional(v.number()),
  })
    .index('by_authUserId', ['authUserId'])
    .index('by_email', ['email'])
    .index('by_status', ['status']),

  userSettings: defineTable({
    userId: v.string(),
    planTier: v.optional(v.union(v.literal('free'), v.literal('pro'))),
    planUpdatedAtMs: v.optional(v.number()),
    notifications: v.optional(
      v.object({
        billReminderLeadDays: v.array(v.number()),
        emailEnabled: v.boolean(),
        telegramEnabled: v.boolean(),
      }),
    ),
    // Compatibility for clearLegacyDeletionFlags: remove after the migration
    // completes in staging and production (decision 0024 rollout constraint).
    deletionRequestedAtMs: v.optional(v.number()),
    jevTriageUsage: v.optional(
      v.object({
        date: v.string(),
        count: v.number(),
      }),
    ),
    forecastProfile: v.optional(
      v.object({
        birthYear: v.number(),
        defaultRetirementAge: v.number(),
        onboardingCompletedAtMs: v.optional(v.number()),
      }),
    ),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
  }).index('by_userId', ['userId']),

  accountDeletions: defineTable({
    userId: v.optional(v.string()),
    userHash: v.string(),
    status: v.union(v.literal('wiping'), v.literal('done'), v.literal('failed')),
    currentStep: v.string(),
    requestedAtMs: v.number(),
    updatedAtMs: v.number(),
    attemptCount: v.number(),
    nextRetryAtMs: v.optional(v.number()),
    lastError: v.optional(v.string()),
    revocationResults: v.optional(
      v.array(v.object({
        connectionId: v.id('providerConnections'),
        provider: bankProviderValidator,
        sessionId: v.optional(v.string()),
        ok: v.boolean(),
        code: v.optional(v.string()),
      })),
    ),
    workosDeleted: v.boolean(),
    wipeCompletedAtMs: v.optional(v.number()),
    // Retained across retries because the agent component deletes thread metadata
    // before it finishes deleting the thread's stream records.
    currentAgentThreadId: v.optional(v.string()),
  })
    .index('by_userId', ['userId'])
    .index('by_userHash', ['userHash'])
    .index('by_status', ['status'])
    .index('by_status_and_updatedAtMs', ['status', 'updatedAtMs'])
    .index('by_status_and_nextRetryAtMs', ['status', 'nextRetryAtMs']),

  deletedUsers: defineTable({
    userHash: v.string(),
    deletedAtMs: v.number(),
  })
    .index('by_userHash', ['userHash'])
    .index('by_deletedAtMs', ['deletedAtMs']),

  dataExports: defineTable({
    userId: v.string(),
    status: v.union(v.literal('queued'), v.literal('running'), v.literal('completed'), v.literal('failed')),
    format: v.literal('json'),
    storageId: v.optional(v.id('_storage')),
    errorCode: v.optional(v.string()),
    requestedAtMs: v.number(),
    completedAtMs: v.optional(v.number()),
    expiresAtMs: v.number(),
  })
    .index('by_userId_and_requestedAtMs', ['userId', 'requestedAtMs'])
    .index('by_status_and_expiresAtMs', ['status', 'expiresAtMs']),

  providerAuthRequests: defineTable({
    userId: v.string(),
    provider: bankProviderValidator,
    state: v.string(),
    status: v.union(
      v.literal('created'),
      v.literal('redirected'),
      v.literal('processing'),
      v.literal('completed'),
      v.literal('failed'),
      v.literal('expired'),
    ),
    redirectUrl: v.string(),
    aspspName: v.string(),
    aspspCountry: v.string(),
    psuType: v.union(v.literal('personal'), v.literal('business')),
    providerConnectionId: v.optional(v.id('providerConnections')),
    authorizationId: v.optional(v.string()),
    providerUserHash: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    createdAtMs: v.number(),
    expiresAtMs: v.number(),
    processingStartedAtMs: v.optional(v.number()),
    completedAtMs: v.optional(v.number()),
  })
    .index('by_state', ['state'])
    .index('by_userId_and_status', ['userId', 'status']),

  providerConnections: defineTable({
    userId: v.string(),
    provider: bankProviderValidator,
    status: connectionStatusValidator,
    displayName: v.string(),
    sessionId: v.optional(v.string()),
    aspspName: v.optional(v.string()),
    aspspCountry: v.optional(v.string()),
    psuType: v.optional(v.union(v.literal('personal'), v.literal('business'))),
    accessValidUntil: v.optional(v.string()),
    providerUserHash: v.optional(v.string()),
    lastSyncedAtMs: v.optional(v.number()),
    nextSyncAfterMs: v.optional(v.number()),
    statusDetail: v.optional(v.string()),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_and_provider', ['userId', 'provider'])
    .index('by_userId_and_status', ['userId', 'status'])
    .index('by_provider_and_sessionId', ['provider', 'sessionId']),

  financialAccounts: defineTable({
    userId: v.string(),
    providerConnectionId: v.optional(v.union(v.id('providerConnections'), v.null())),
    provider: bankProviderValidator,
    providerAccountId: v.optional(v.union(v.string(), v.null())),
    providerAccountHash: v.optional(v.union(v.string(), v.null())),
    name: v.string(),
    alias: v.optional(v.union(v.string(), v.null())),
    hidden: v.optional(v.boolean()),
    officialName: v.optional(v.union(v.string(), v.null())),
    institutionName: v.optional(v.string()),
    accountType: v.optional(v.string()),
    accountSubtype: v.optional(v.union(v.string(), v.null())),
    currency: v.string(),
    ibanMasked: v.optional(v.string()),
    status: connectionStatusValidator,
    syncEnabled: v.boolean(),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_and_status', ['userId', 'status'])
    .index('by_providerConnectionId', ['providerConnectionId'])
    .index('by_provider_and_providerAccountId', ['provider', 'providerAccountId']),

  accountSyncStates: defineTable({
    userId: v.string(),
    providerConnectionId: v.id('providerConnections'),
    accountId: v.id('financialAccounts'),
    provider: bankProviderValidator,
    status: v.union(
      v.literal('active'),
      v.literal('paused'),
      v.literal('rateLimited'),
      v.literal('reauthorizationRequired'),
      v.literal('error'),
    ),
    backfillFromDate: v.string(),
    lastBookedDate: v.optional(v.string()),
    lastPendingDate: v.optional(v.string()),
    nextSyncAfterMs: v.number(),
    syncCadenceHours: v.number(),
    consecutiveFailures: v.number(),
    lastErrorCode: v.optional(v.string()),
    lastErrorMessage: v.optional(v.string()),
    updatedAtMs: v.number(),
  })
    .index('by_status_and_nextSyncAfterMs', ['status', 'nextSyncAfterMs'])
    .index('by_userId', ['userId'])
    .index('by_userId_and_status', ['userId', 'status'])
    .index('by_accountId', ['accountId']),

  importJobs: defineTable({
    userId: v.string(),
    provider: bankProviderValidator,
    providerConnectionId: v.optional(v.id('providerConnections')),
    accountId: v.optional(v.id('financialAccounts')),
    kind: v.union(v.literal('connectionCallback'), v.literal('accountBackfill'), v.literal('accountRefresh')),
    trigger: v.optional(
      v.union(v.literal('callback'), v.literal('initialCallback'), v.literal('cron'), v.literal('manual')),
    ),
    status: importJobStatusValidator,
    dateFrom: v.optional(v.string()),
    dateTo: v.optional(v.string()),
    transactionStatus: v.optional(transactionStatusValidator),
    continuationKey: v.optional(v.string()),
    balancesSeen: v.optional(v.number()),
    balancesImported: v.optional(v.number()),
    transactionsSeen: v.optional(v.number()),
    transactionsImported: v.optional(v.number()),
    transactionPagesFetched: v.optional(v.number()),
    nextRetryAtMs: v.optional(v.number()),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    startedAtMs: v.optional(v.number()),
    completedAtMs: v.optional(v.number()),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
  })
    .index('by_status_and_nextRetryAtMs', ['status', 'nextRetryAtMs'])
    .index('by_userId_and_status', ['userId', 'status'])
    .index('by_userId_and_createdAtMs', ['userId', 'createdAtMs'])
    .index('by_accountId_and_createdAtMs', ['accountId', 'createdAtMs']),

  accountBalances: defineTable({
    userId: v.string(),
    accountId: v.id('financialAccounts'),
    providerConnectionId: v.id('providerConnections'),
    provider: bankProviderValidator,
    balanceType: v.string(),
    balanceName: v.optional(v.string()),
    amount: moneyAmountValidator,
    referenceDate: v.optional(v.string()),
    fetchedAtMs: v.number(),
  })
    .index('by_accountId_and_fetchedAtMs', ['accountId', 'fetchedAtMs'])
    .index('by_userId_and_fetchedAtMs', ['userId', 'fetchedAtMs']),

  categories: defineTable({
    userId: v.string(),
    name: v.string(),
    systemKey: v.optional(v.string()),
    kind: v.union(v.literal('expense'), v.literal('income'), v.literal('transfer')),
    // `kind` remains the default/legacy kind. System categories that can be
    // used across transaction types declare the complete compatibility set.
    // 'internal' is applicableKinds-only today (no category's primary kind is
    // 'internal') — it lets a category stay attached to internal-classified
    // transactions (loan/mortgage repayments) without forcing a reclassification.
    applicableKinds: v.optional(
      v.array(v.union(v.literal('expense'), v.literal('income'), v.literal('transfer'), v.literal('internal'))),
    ),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    budgetEligible: v.boolean(),
    archived: v.optional(v.boolean()),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_and_kind', ['userId', 'kind'])
    .index('by_userId_and_systemKey', ['userId', 'systemKey']),

  categoryRules: defineTable({
    userId: v.string(),
    matchField: v.union(v.literal('merchant'), v.literal('description')),
    matchType: v.union(v.literal('contains'), v.literal('equals'), v.literal('prefix')),
    pattern: v.string(),
    categoryId: v.id('categories'),
    // optional extra actions applied alongside category assignment (M4)
    addTagIds: v.optional(v.array(v.id('transactionTags'))),
    hideFromReports: v.optional(v.boolean()),
    enabled: v.boolean(),
    priority: v.number(),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
  })
    .index('by_userId_and_priority', ['userId', 'priority'])
    .index('by_userId_and_categoryId', ['userId', 'categoryId']),

  transactions: defineTable({
    userId: v.string(),
    accountId: v.id('financialAccounts'),
    providerConnectionId: v.id('providerConnections'),
    provider: bankProviderValidator,
    providerTransactionId: v.optional(v.union(v.string(), v.null())),
    providerEntryReference: v.optional(v.string()),
    dedupeKey: v.string(),
    status: transactionStatusValidator,
    direction: transactionDirectionValidator,
    amount: moneyAmountValidator,
    bookingDate: v.string(),
    valueDate: v.optional(v.string()),
    transactionDate: v.optional(v.string()),
    description: v.string(),
    counterpartyName: v.optional(v.union(v.string(), v.null())),
    merchantCategoryCode: v.optional(v.union(v.string(), v.null())),
    remittanceInformation: v.optional(v.array(v.string())),
    referenceNumber: v.optional(v.union(v.string(), v.null())),
    classificationKind: classificationKindValidator,
    classificationSource: classificationSourceValidator,
    classificationConfidence: v.optional(v.number()),
    categoryId: v.optional(v.id('categories')),
    subscriptionId: v.optional(v.id('subscriptions')),
    transferMatchId: v.optional(v.id('transferMatches')),
    tagIds: v.optional(v.array(v.id('transactionTags'))),
    hiddenFromReports: v.optional(v.boolean()),
    note: v.optional(v.string()),
    providerMetadata: v.optional(metadataValidator),
    importedAtMs: v.number(),
    updatedAtMs: v.number(),
  })
    .index('by_accountId_and_dedupeKey', ['accountId', 'dedupeKey'])
    .index('by_userId_and_bookingDate', ['userId', 'bookingDate'])
    .index('by_userId_and_classificationKind', ['userId', 'classificationKind'])
    .index('by_userId_and_accountId_and_bookingDate', ['userId', 'accountId', 'bookingDate'])
    .index('by_userId_and_classificationKind_and_bookingDate', ['userId', 'classificationKind', 'bookingDate'])
    .index('by_userId_and_direction_and_bookingDate', ['userId', 'direction', 'bookingDate'])
    .index('by_userId_and_status_and_bookingDate', ['userId', 'status', 'bookingDate'])
    // Cross-user scan for the daily promotion of due scheduled rows.
    .index('by_status_and_bookingDate', ['status', 'bookingDate'])
    .index('by_userId_and_categoryId_and_bookingDate', ['userId', 'categoryId', 'bookingDate'])
    .index('by_subscriptionId', ['subscriptionId'])
    .index('by_transferMatchId', ['transferMatchId']),

  subscriptions: defineTable({
    userId: v.string(),
    accountId: v.optional(v.union(v.id('financialAccounts'), v.null())),
    name: v.string(),
    alias: v.optional(v.union(v.string(), v.null())),
    merchantName: v.optional(v.string()),
    description: v.optional(v.string()),
    amount: moneyAmountValidator,
    interval: recurrenceIntervalValidator,
    intervalCount: v.number(),
    status: v.union(v.literal('active'), v.literal('paused'), v.literal('ended')),
    startDate: v.string(),
    nextDueDate: v.optional(v.string()),
    trialPeriodDays: v.number(),
    source: v.union(v.literal('manual'), v.literal('detected'), v.literal('transaction')),
    confidence: v.optional(v.number()),
    categoryId: v.optional(v.id('categories')),
    latestTransactionId: v.optional(v.id('transactions')),
    moneyBoxId: v.optional(v.id('moneyBoxes')),
    metadata: v.optional(metadataValidator),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
  })
    .index('by_name', ['name'])
    .index('by_userId', ['userId'])
    .index('by_userId_and_categoryId', ['userId', 'categoryId'])
    .index('by_userId_and_status', ['userId', 'status'])
    .index('by_userId_and_accountId_and_status', ['userId', 'accountId', 'status'])
    .index('by_userId_and_nextDueDate', ['userId', 'nextDueDate'])
    .index('by_moneyBoxId', ['moneyBoxId']),

  transferMatches: defineTable({
    userId: v.string(),
    outgoingTransactionId: v.id('transactions'),
    incomingTransactionId: v.id('transactions'),
    status: v.union(v.literal('candidate'), v.literal('confirmed'), v.literal('rejected')),
    amountDelta: moneyAmountValidator,
    feeAmount: v.optional(moneyAmountValidator),
    confidence: v.optional(v.number()),
    source: v.union(v.literal('system'), v.literal('user')),
    notes: v.optional(v.string()),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
  })
    .index('by_userId_and_status', ['userId', 'status'])
    .index('by_outgoingTransactionId', ['outgoingTransactionId'])
    .index('by_incomingTransactionId', ['incomingTransactionId']),

  plannedExpenseOccurrencePayments: defineTable({
    userId: v.string(),
    plannedTransactionId: v.optional(v.id('plannedTransactions')),
    dueDate: v.string(),
    status: v.union(v.literal('paid'), v.literal('reopened')),
    source: v.union(v.literal('manual'), v.literal('linkedTransaction'), v.literal('automatic')),
    transactionId: v.optional(v.id('transactions')),
    paidAtMs: v.number(),
    updatedAtMs: v.number(),
  })
    .index('by_plannedTransactionId_and_dueDate', ['plannedTransactionId', 'dueDate'])
    .index('by_userId_and_dueDate', ['userId', 'dueDate'])
    .index('by_userId_and_status', ['userId', 'status'])
    .index('by_transactionId', ['transactionId']),

  plannedTransactions: defineTable({
    userId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    note: v.optional(v.string()),
    amount: moneyAmountValidator,
    dueDate: v.string(),
    kind: v.union(v.literal('expense'), v.literal('income'), v.literal('transfer'), v.literal('internal')),
    direction: v.optional(v.union(v.literal('inflow'), v.literal('outflow'))),
    status: v.union(v.literal('planned'), v.literal('funding'), v.literal('paid'), v.literal('cancelled')),
    accountId: v.optional(v.union(v.id('financialAccounts'), v.null())),
    source: v.union(v.literal('manual'), v.literal('suggested'), v.literal('subscription')),
    recurrenceInterval: v.optional(recurrenceIntervalValidator),
    recurrenceIntervalCount: v.optional(v.number()),
    categoryId: v.optional(v.id('categories')),
    subscriptionId: v.optional(v.id('subscriptions')),
    moneyBoxId: v.optional(v.id('moneyBoxes')),
    latestTransactionId: v.optional(v.id('transactions')),
    reconciliationMerchantKey: v.optional(v.string()),
    fromAccountId: v.optional(v.id('financialAccounts')),
    fromCreditFacilityId: v.optional(v.id('creditFacilities')),
    toAccountId: v.optional(v.id('financialAccounts')),
    completedTransferMatchId: v.optional(v.id('transferMatches')),
    completedAtMs: v.optional(v.number()),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
  })
    .index('by_kind', ['kind'])
    .index('by_userId_and_dueDate', ['userId', 'dueDate'])
    .index('by_userId_and_categoryId', ['userId', 'categoryId'])
    .index('by_userId_and_status', ['userId', 'status'])
    .index('by_userId_and_status_and_dueDate', ['userId', 'status', 'dueDate'])
    .index('by_userId_and_accountId_and_status', ['userId', 'accountId', 'status'])
    .index('by_userId_and_latestTransactionId', ['userId', 'latestTransactionId'])
    .index('by_userId_and_kind_and_dueDate', ['userId', 'kind', 'dueDate'])
    .index('by_userId_and_kind_and_categoryId', ['userId', 'kind', 'categoryId'])
    .index('by_userId_and_kind_and_latestTransactionId', ['userId', 'kind', 'latestTransactionId'])
    .index('by_userId_and_kind_and_accountId_and_status', ['userId', 'kind', 'accountId', 'status'])
    // Convex caps index names at 64 characters, so these two drop the `_and_` spelling the rest of
    // the file uses rather than dropping a field from the name.
    .index('by_userId_kind_accountId_status_recurrence', [
      'userId',
      'kind',
      'accountId',
      'status',
      'recurrenceInterval',
    ])
    .index('by_userId_and_kind_and_status_and_dueDate', ['userId', 'kind', 'status', 'dueDate'])
    .index('by_userId_kind_status_recurrence', ['userId', 'kind', 'status', 'recurrenceInterval'])
    .index('by_userId_and_fromAccountId_and_status', ['userId', 'fromAccountId', 'status'])
    .index('by_userId_and_toAccountId_and_status', ['userId', 'toAccountId', 'status'])
    .index('by_completedTransferMatchId', ['completedTransferMatchId'])
    .index('by_moneyBoxId', ['moneyBoxId']),

  moneyBoxes: defineTable({
    userId: v.string(),
    accountId: v.optional(v.id('financialAccounts')),
    name: v.string(),
    targetAmount: moneyAmountValidator,
    savedAmount: moneyAmountValidator,
    targetDate: v.string(),
    status: v.union(v.literal('active'), v.literal('completed'), v.literal('archived')),
    source: v.union(v.literal('manual'), v.literal('suggested'), v.literal('plannedExpense')),
    plannedTransactionId: v.optional(v.id('plannedTransactions')),
    growthRatePct: v.optional(v.number()),
    spendingReducesProgress: v.optional(v.boolean()),
    heldOutsideBalance: v.optional(v.boolean()),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
  })
    .index('by_userId_and_targetDate', ['userId', 'targetDate'])
    .index('by_userId_and_status', ['userId', 'status']),

  moneyBoxContributions: defineTable({
    userId: v.string(),
    moneyBoxId: v.id('moneyBoxes'),
    // absent kind = legacy row, treated as 'contribution'
    kind: v.optional(v.union(v.literal('contribution'), v.literal('withdrawal'))),
    amount: moneyAmountValidator,
    contributionDate: v.string(),
    source: v.union(v.literal('manual'), v.literal('system'), v.literal('transaction')),
    transactionId: v.optional(v.id('transactions')),
    createdAtMs: v.number(),
  })
    .index('by_moneyBoxId_and_contributionDate', ['moneyBoxId', 'contributionDate'])
    .index('by_userId_and_contributionDate', ['userId', 'contributionDate'])
    .index('by_transactionId', ['transactionId']),

  planningPreferences: defineTable({
    userId: v.string(),
    cycleInterval: recurrenceIntervalValidator,
    cycleIntervalCount: v.number(),
    anchorDate: v.string(),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
  }).index('by_userId', ['userId']),

  plans: defineTable({
    userId: v.string(),
    name: v.string(),
    currency: v.string(),
    startPeriod: v.string(),
    // Optional during the compatibility window. Missing means the legacy behavior: include the
    // whole start month. Existing plans are backfilled to `${startPeriod}-01`.
    startDate: v.optional(v.string()),
    // Deprecated: liquidity is read from account balances, not reconstructed from an opening
    // carry. Kept optional so existing documents still validate; recalculatePlan strips it.
    openingCarryMinor: v.optional(v.int64()),
    accountIds: v.array(v.id('financialAccounts')),
    expectedIncomeMinor: v.optional(v.int64()),
    // Informational payoff guidance for the aggregate Plan liquidity perimeter. It never reserves
    // money or participates in Ready to Assign.
    overdraftTargetDate: v.optional(v.string()),
    isDefault: v.boolean(),
    sortOrder: v.number(),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_and_name', ['userId', 'name']),

  planGroups: defineTable({
    planId: v.id('plans'),
    userId: v.string(),
    name: v.string(),
    sortOrder: v.number(),
    collapsed: v.boolean(),
    hidden: v.boolean(),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_planId_and_sortOrder', ['planId', 'sortOrder']),

  planBuckets: defineTable({
    planId: v.id('plans'),
    userId: v.string(),
    groupId: v.id('planGroups'),
    name: v.string(),
    sortOrder: v.number(),
    hidden: v.boolean(),
    note: v.optional(v.string()),
    isUnplanned: v.boolean(),
    cardAccountId: v.optional(v.id('financialAccounts')),
    installmentPlanId: v.optional(v.id('creditFacilityInstallmentPlans')),
    moneyBoxId: v.optional(v.id('moneyBoxes')),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_planId_and_groupId_and_sortOrder', ['planId', 'groupId', 'sortOrder'])
    .index('by_moneyBoxId', ['moneyBoxId']),

  planBucketCategories: defineTable({
    planId: v.id('plans'),
    userId: v.string(),
    bucketId: v.id('planBuckets'),
    categoryId: v.id('categories'),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_planId_and_categoryId', ['planId', 'categoryId'])
    .index('by_bucketId', ['bucketId']),

  planAssignments: defineTable({
    planId: v.id('plans'),
    userId: v.string(),
    bucketId: v.id('planBuckets'),
    period: v.string(),
    assignedMinor: v.int64(),
    currency: v.string(),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_planId_and_period_and_bucketId', ['planId', 'period', 'bucketId'])
    .index('by_planId_and_period', ['planId', 'period'])
    .index('by_bucketId', ['bucketId']),

  planTargets: defineTable({
    planId: v.id('plans'),
    userId: v.string(),
    bucketId: v.id('planBuckets'),
    cadence: v.union(v.literal('weekly'), v.literal('monthly'), v.literal('yearly'), v.literal('custom')),
    behaviour: v.union(v.literal('setAside'), v.literal('refill'), v.literal('balanceBy')),
    amountMinor: v.int64(),
    currency: v.string(),
    dueDate: v.optional(v.string()),
    dayOfMonth: v.optional(v.number()),
    dayOfWeek: v.optional(v.number()),
    repeats: v.boolean(),
    repeatIntervalCount: v.optional(v.number()),
    repeatIntervalUnit: v.optional(v.union(v.literal('month'), v.literal('year'))),
    snoozedPeriods: v.array(v.string()),
  })
    .index('by_userId', ['userId'])
    .index('by_planId_and_bucketId', ['planId', 'bucketId']),

  planMonthSnapshots: defineTable({
    planId: v.id('plans'),
    userId: v.string(),
    period: v.string(),
    entries: v.array(
      v.object({
        bucketId: v.id('planBuckets'),
        assignedMinor: v.int64(),
        activityMinor: v.int64(),
        // Deprecated snapshot payload retained as optional for rows written before the cache rebuild.
        coveredCardSpendMinor: v.optional(v.int64()),
        availableEndMinor: v.int64(),
      }),
    ),
    // Deprecated snapshot payload retained as optional for rows written before the cache rebuild.
    readyToAssignEndMinor: v.optional(v.int64()),
    cashOverspendingMinor: v.optional(v.int64()),
    computedAtMs: v.number(),
  })
    .index('by_planId_and_period', ['planId', 'period'])
    .index('by_userId', ['userId']),

  transactionTags: defineTable({
    userId: v.string(),
    name: v.string(),
    color: v.optional(v.string()),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_and_name', ['userId', 'name']),

  savedReports: defineTable({
    userId: v.string(),
    name: v.string(),
    config: savedReportConfigValidator,
    sortOrder: v.number(),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
  }).index('by_userId_and_sortOrder', ['userId', 'sortOrder']),

  forecastScenarios: defineTable({
    userId: v.string(),
    name: v.string(),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
    sortOrder: v.number(),
    currency: v.string(),
    inflationAnnualPct: v.number(),
    endAge: v.number(),
    livingExpenses: v.object({
      amountMonthly: moneyAmountValidator,
      changeMode: forecastChangeModeValidator,
      customPct: v.optional(v.number()),
    }),
    // bounded (≤20 splits enforced in mutations) so safe to embed
    extraSavings: v.object({
      growthAnnualPct: v.number(),
      splits: v.array(v.object({ accountId: v.id('financialAccounts'), pct: v.number() })),
    }),
    capitalGainsTaxPct: v.number(),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_and_sortOrder', ['userId', 'sortOrder']),

  forecastAccountAssumptions: defineTable({
    userId: v.string(),
    scenarioId: v.id('forecastScenarios'),
    target: v.union(
      v.object({ kind: v.literal('account'), accountId: v.id('financialAccounts') }),
      v.object({ kind: v.literal('creditFacility'), creditFacilityId: v.id('creditFacilities') }),
    ),
    included: v.boolean(),
    growthAnnualPct: v.optional(v.number()),
    contributionYearly: v.optional(moneyAmountValidator),
    // null/absent liability fields mean "read live from creditFacilities at projection time"
    liability: v.optional(
      v.object({
        annualRateBps: v.optional(v.number()),
        paymentMonthly: v.optional(moneyAmountValidator),
        includedInLivingExpenses: v.boolean(),
      }),
    ),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
  })
    .index('by_scenarioId', ['scenarioId'])
    .index('by_userId', ['userId']),

  forecastIncomeSources: defineTable({
    userId: v.string(),
    scenarioId: v.id('forecastScenarios'),
    name: v.string(),
    amountMonthly: moneyAmountValidator,
    changeMode: forecastChangeModeValidator,
    customPct: v.optional(v.number()),
    sortOrder: v.number(),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
  })
    .index('by_scenarioId_and_sortOrder', ['scenarioId', 'sortOrder'])
    .index('by_userId', ['userId']),

  forecastLifeEvents: defineTable({
    userId: v.string(),
    scenarioId: v.id('forecastScenarios'),
    enabled: v.boolean(),
    event: forecastLifeEventValidator,
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
  })
    .index('by_scenarioId', ['scenarioId'])
    .index('by_userId', ['userId']),

  creditFacilities: defineTable({
    userId: v.string(),
    name: v.string(),
    facilityType: creditFacilityTypeValidator,
    status: creditFacilityStatusValidator,
    source: v.union(v.literal('manual'), v.literal('provider'), v.literal('suggested')),
    linkedAccountId: v.optional(v.id('financialAccounts')),
    // Cash account charged for card statements or loan instalments; Planning
    // routes those outflows here instead of to the debt facility itself.
    settlementAccountId: v.optional(v.id('financialAccounts')),
    provider: bankProviderValidator,
    limitAmount: moneyAmountValidator,
    usedAmount: moneyAmountValidator,
    // Amount originally borrowed. A loan is usually entered part-way through its life, so the balance
    // above is the residual and says nothing about how much has already been repaid; without this the
    // loan reads as if it started at today's balance.
    originalPrincipalAmount: v.optional(moneyAmountValidator),
    minimumPurchaseAmount: v.optional(moneyAmountValidator),
    minimumPaymentAmount: v.optional(moneyAmountValidator),
    escrowAmount: v.optional(moneyAmountValidator),
    // Balloon due with the last instalment (Italian "maxirata" / guaranteed future value). Absent on
    // an ordinary loan, which simply amortises to zero.
    finalPaymentAmount: v.optional(moneyAmountValidator),
    firstPaymentDate: v.optional(v.string()),
    // Last instalment date as the contract states it. Italian variable-rate mortgages keep the capital
    // schedule fixed and move the instalment, so amortising the balance at today's rate lands years
    // off; when the user knows the date, it wins over the projection.
    maturityDate: v.optional(v.string()),
    pairedPlanBucketId: v.optional(v.id('planBuckets')),
    repaymentType: creditFacilityRepaymentTypeValidator,
    standardInstallmentMonths: v.optional(v.number()),
    minInstallmentMonths: v.optional(v.number()),
    maxInstallmentMonths: v.optional(v.number()),
    annualNominalRateBps: v.optional(v.number()),
    statementDayOfMonth: v.optional(v.number()),
    paymentDayOfMonth: v.optional(v.number()),
    notes: v.optional(v.string()),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_and_status', ['userId', 'status'])
    .index('by_status', ['status'])
    .index('by_userId_and_facilityType', ['userId', 'facilityType'])
    .index('by_linkedAccountId', ['linkedAccountId']),

  creditFacilityInstallmentPlans: defineTable({
    userId: v.string(),
    creditFacilityId: v.id('creditFacilities'),
    name: v.string(),
    principalAmount: moneyAmountValidator,
    outstandingAmount: moneyAmountValidator,
    monthlyPaymentAmount: moneyAmountValidator,
    defaultPrincipalAmount: v.optional(moneyAmountValidator),
    defaultInterestAmount: v.optional(moneyAmountValidator),
    defaultFeeAmount: v.optional(moneyAmountValidator),
    installmentCount: v.number(),
    remainingInstallments: v.number(),
    startDate: v.string(),
    nextPaymentDate: v.optional(v.string()),
    endDate: v.string(),
    status: creditFacilityPlanStatusValidator,
    linkedTransactionId: v.optional(v.id('transactions')),
    // Marker shared by the write path and the one-off repair: plans created after card-balance
    // separation must be indistinguishable from repaired legacy plans to keep the repair idempotent.
    manualCardBalanceCorrectionApplied: v.optional(v.boolean()),
    manualCardBalanceCorrectionAppliedAtMs: v.optional(v.number()),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_and_status', ['userId', 'status'])
    .index('by_creditFacilityId', ['creditFacilityId'])
    .index('by_creditFacilityId_and_status', ['creditFacilityId', 'status'])
    .index('by_linkedTransactionId', ['linkedTransactionId']),

  creditFacilityInstallmentPayments: defineTable({
    userId: v.string(),
    creditFacilityId: v.id('creditFacilities'),
    installmentPlanId: v.id('creditFacilityInstallmentPlans'),
    amount: moneyAmountValidator,
    principalAmount: v.optional(moneyAmountValidator),
    interestAmount: v.optional(moneyAmountValidator),
    feeAmount: v.optional(moneyAmountValidator),
    paymentDate: v.string(),
    scheduledDueDate: v.optional(v.string()),
    source: v.union(v.literal('manual'), v.literal('transaction')),
    transactionId: v.optional(v.id('transactions')),
    notes: v.optional(v.string()),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
  })
    .index('by_userId_and_paymentDate', ['userId', 'paymentDate'])
    .index('by_installmentPlanId_and_paymentDate', ['installmentPlanId', 'paymentDate'])
    .index('by_installmentPlanId_and_scheduledDueDate', ['installmentPlanId', 'scheduledDueDate'])
    .index('by_transactionId', ['transactionId'])
    .index('by_transactionId_and_installmentPlanId', ['transactionId', 'installmentPlanId']),

  creditFacilityUsageCycles: defineTable({
    userId: v.string(),
    creditFacilityId: v.id('creditFacilities'),
    cycleMonth: v.string(),
    status: creditFacilityUsageCycleStatusValidator,
    trackedAmount: moneyAmountValidator,
    dueDate: v.string(),
    transactionId: v.optional(v.id('transactions')),
    closedAtMs: v.optional(v.number()),
    paidAtMs: v.optional(v.number()),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
  })
    .index('by_userId_and_status_and_dueDate', ['userId', 'status', 'dueDate'])
    .index('by_userId_and_creditFacilityId_and_status', ['userId', 'creditFacilityId', 'status'])
    .index('by_creditFacilityId_and_cycleMonth', ['creditFacilityId', 'cycleMonth'])
    .index('by_creditFacilityId_and_status', ['creditFacilityId', 'status'])
    .index('by_transactionId', ['transactionId']),

  healthScoreSnapshots: defineTable({
    userId: v.string(),
    computedAtDate: v.string(),
    currency: v.string(),
    score: v.number(),
    components: v.object({
      savingsRate: v.number(),
      budgetAdherence: v.number(),
      debtLoad: v.number(),
      liquidityMonths: v.number(),
      subscriptionLoad: v.number(),
    }),
    createdAtMs: v.number(),
  })
    .index('by_userId_and_computedAtDate', ['userId', 'computedAtDate'])
    .index('by_userId_and_currency_and_computedAtDate', ['userId', 'currency', 'computedAtDate']),

  // UC5 write-guard badge cache: advisory risk badge per approval request,
  // computed once when the approval is created, read when rendering it.
  writeGuardBadges: defineTable({
    userId: v.string(),
    threadId: v.string(),
    approvalId: v.string(),
    toolName: v.string(),
    badge: v.union(v.literal('safe'), v.literal('confirm'), v.literal('block')),
    recordCount: v.number(),
    createdAtMs: v.number(),
  })
    .index('by_threadId_and_approvalId', ['threadId', 'approvalId'])
    .index('by_userId', ['userId']),

  agentReports: defineTable({
    userId: v.string(),
    kind: v.union(v.literal('monthly'), v.literal('subscriptionReview')),
    period: v.string(),
    threadId: v.optional(v.string()),
    outputMessageId: v.optional(v.string()),
    status: v.union(v.literal('pending'), v.literal('running'), v.literal('completed'), v.literal('failed')),
    locale: v.string(),
    summary: v.optional(v.string()),
    emailId: v.optional(v.string()),
    emailStatus: v.optional(v.union(v.literal('queued'), v.literal('skipped'))),
    errorMessage: v.optional(v.string()),
    attempts: v.number(),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
    completedAtMs: v.optional(v.number()),
  })
    .index('by_userId_and_period_and_kind', ['userId', 'period', 'kind'])
    .index('by_userId_and_kind_and_period', ['userId', 'kind', 'period'])
    .index('by_status_and_updatedAtMs', ['status', 'updatedAtMs']),

  proactiveJobs: defineTable({
    userId: v.string(),
    kind: v.union(
      v.literal('healthScore'),
      v.literal('spendingAnomaly'),
      v.literal('subscriptionReview'),
      v.literal('monthlyReport'),
    ),
    dedupeKey: v.string(),
    asOfDate: v.string(),
    period: v.optional(v.string()),
    locale: v.string(),
    status: v.union(v.literal('pending'), v.literal('running'), v.literal('completed'), v.literal('failed')),
    attempts: v.number(),
    maxAttempts: v.number(),
    nextRunAtMs: v.number(),
    leaseToken: v.optional(v.string()),
    leaseExpiresAtMs: v.optional(v.number()),
    errorCode: v.optional(v.string()),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
    completedAtMs: v.optional(v.number()),
  })
    .index('by_userId', ['userId'])
    .index('by_dedupeKey', ['dedupeKey'])
    .index('by_status_and_nextRunAtMs', ['status', 'nextRunAtMs'])
    .index('by_status_and_leaseExpiresAtMs', ['status', 'leaseExpiresAtMs']),

  notifications: defineTable({
    userId: v.string(),
    type: notificationTypeValidator,
    severity: v.union(v.literal('info'), v.literal('warning'), v.literal('critical')),
    titleKey: v.string(),
    bodyKey: v.string(),
    params: v.record(v.string(), v.union(v.string(), v.number())),
    dedupeKey: v.string(),
    readAtMs: v.optional(v.number()),
    emailDeliveredAtMs: v.optional(v.number()),
    telegramDeliveredAtMs: v.optional(v.number()),
    createdAtMs: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_and_createdAtMs', ['userId', 'createdAtMs'])
    .index('by_userId_and_dedupeKey', ['userId', 'dedupeKey']),

  analystTurnLocks: defineTable({
    userId: v.string(),
    threadId: v.string(),
    expiresAtMs: v.number(),
    createdAtMs: v.number(),
  })
    .index('by_threadId', ['threadId'])
    .index('by_userId', ['userId']),

  telegramLinks: defineTable({
    userId: v.string(),
    chatId: v.string(),
    verifiedAtMs: v.number(),
    threadId: v.optional(v.string()),
    locale: v.optional(v.string()),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_chatId', ['chatId']),

  telegramLinkCodes: defineTable({
    userId: v.string(),
    codeHash: v.string(),
    expiresAtMs: v.number(),
    usedAtMs: v.optional(v.number()),
    createdAtMs: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_and_createdAtMs', ['userId', 'createdAtMs'])
    .index('by_codeHash', ['codeHash'])
    .index('by_expiresAtMs', ['expiresAtMs']),

  telegramUpdates: defineTable({
    updateId: v.number(),
    chatId: v.string(),
    kind: v.union(v.literal('link'), v.literal('message'), v.literal('unlinkedMessage'), v.literal('rateLimited')),
    userId: v.optional(v.string()),
    threadId: v.optional(v.string()),
    promptMessageId: v.optional(v.string()),
    inboundText: v.string(),
    locale: v.string(),
    outboundText: v.optional(v.string()),
    sentChunkCount: v.number(),
    stage: v.union(v.literal('generate'), v.literal('send')),
    status: v.union(v.literal('pending'), v.literal('processing'), v.literal('completed'), v.literal('failed')),
    attempts: v.number(),
    maxAttempts: v.number(),
    nextRunAtMs: v.number(),
    leaseToken: v.optional(v.string()),
    leaseExpiresAtMs: v.optional(v.number()),
    errorCode: v.optional(v.string()),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
    completedAtMs: v.optional(v.number()),
  })
    .index('by_updateId', ['updateId'])
    .index('by_userId', ['userId'])
    .index('by_userId_and_status_and_updatedAtMs', ['userId', 'status', 'updatedAtMs'])
    .index('by_chatId_and_status_and_updateId', ['chatId', 'status', 'updateId'])
    .index('by_status_and_nextRunAtMs', ['status', 'nextRunAtMs'])
    .index('by_status_and_leaseExpiresAtMs', ['status', 'leaseExpiresAtMs'])
    .index('by_status_and_updatedAtMs', ['status', 'updatedAtMs']),

  agentMemories: defineTable({
    userId: v.string(),
    kind: v.union(v.literal('fact'), v.literal('preference'), v.literal('goal')),
    content: v.string(),
    normalizedContent: v.string(),
    sourceThreadId: v.optional(v.string()),
    embedding: v.array(v.number()),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
  })
    .index('by_userId_and_kind', ['userId', 'kind'])
    .index('by_userId_and_kind_and_normalizedContent', ['userId', 'kind', 'normalizedContent'])
    .vectorIndex('by_embedding', {
      vectorField: 'embedding',
      dimensions: 1536,
      filterFields: ['userId', 'kind'],
    }),
});
