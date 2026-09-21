import * as React from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { convexQuery } from '@convex-dev/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useMutation } from 'convex/react';
import { FileSpreadsheetIcon, PlusIcon, TagsIcon } from 'lucide-react';
import { toast } from 'sonner';

import { api } from '../../../../convex/_generated/api';
import { DataTable } from './data-table';
import { createTransactionColumns } from './columns';
import { CounterpartTransferDialog } from './counterpart-transfer-dialog';
import { InstallmentMatchDialog } from './installment-match-dialog';
import { ManualTransactionDialog } from './manual-transaction-dialog';
import { ManageTagsDialog } from './manage-tags-dialog';
import { MoneyBoxAssociationDialog } from './money-box-association-dialog';
import { optimisticallyAssignTransactionCategory } from './optimistic-category';
import { ReviewSection } from './review-section';
import { transactionPageRowsForTable } from './table-rows';
import { ScheduledReconcileSheet } from './scheduled-reconcile-sheet';
import { TransactionDetailSheet } from './transaction-detail-sheet';
import { TransferCandidatesCard } from './transfer-candidates-card';
import { isTransactionSortKey, parseFilterQuery, toTransactionFilters } from './filter-query';
import { inlineEntryRecurrenceOptions } from './inline-entry';
import {
  InlineTransactionEditorCard,
  InlineTransactionEditorRows,
  useInlineTransactionEditor,
} from './inline-transaction-editor';
import type { InlineTransactionEditorMode } from './inline-transaction-editor';
import type { SortingState } from '@tanstack/react-table';
import type { FunctionReturnType } from 'convex/server';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import type {
  FilterQueryContext,
  TransactionSortDirection,
  TransactionSortKey,
} from './filter-query';
import type { PlannedOccurrenceRow, TransactionRow } from './columns';
import type { I18nContextValue, TranslationKey } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePendingAction } from '@/hooks/use-pending-action';
import { accountLabel } from '@/lib/accounts';
import { analyticsEvents, trackEvent } from '@/lib/analytics/events';
import { categoryDisplayName } from '@/lib/categories';
import { useAuthedQuery } from '@/hooks/use-authed-query';
import { useI18n } from '@/lib/i18n';

type Transaction = Doc<'transactions'>;
type TransactionPageRow = FunctionReturnType<typeof api.banking.transactions.listTransactionsPage>['rows'][number];
type PlannedOccurrence = FunctionReturnType<
  typeof api.banking.planning.listNextLedgerPlannedOccurrences
>[number];

const recurrenceIntervalKeys = {
  day: { one: 'subscriptions.interval.day.one', other: 'subscriptions.interval.day.other' },
  week: { one: 'subscriptions.interval.week.one', other: 'subscriptions.interval.week.other' },
  month: { one: 'subscriptions.interval.month.one', other: 'subscriptions.interval.month.other' },
  year: { one: 'subscriptions.interval.year.one', other: 'subscriptions.interval.year.other' },
} as const satisfies Record<PlannedOccurrence['recurrence']['interval'], Record<'one' | 'other', TranslationKey>>;

function plannedOccurrenceRecurrenceLabel(
  occurrence: PlannedOccurrence,
  t: I18nContextValue['t'],
) {
  const exactOption = inlineEntryRecurrenceOptions.find(
    (option) =>
      option.recurrence?.interval === occurrence.recurrence.interval &&
      option.recurrence.count === occurrence.recurrence.count,
  );
  if (exactOption) {
    return t(exactOption.labelKey);
  }

  const interval = t(
    recurrenceIntervalKeys[occurrence.recurrence.interval][occurrence.recurrence.count === 1 ? 'one' : 'other'],
  );
  return occurrence.recurrence.count === 1
    ? t('transactions.scheduled.recurrenceOne', { interval })
    : t('transactions.scheduled.recurrenceMany', { count: occurrence.recurrence.count, interval });
}

function createPlannedOccurrenceTransactionRow(input: {
  occurrence: PlannedOccurrence;
  account: Doc<'financialAccounts'>;
  category: Doc<'categories'> | null;
  recurrenceLabel: string;
}): TransactionRow {
  const { occurrence, account, category, recurrenceLabel } = input;
  const syntheticId = `planned:${occurrence.plannedTransactionId}:${occurrence.dueDate}`;

  // Client-only projection: this document-shaped value never leaves the client or reaches a transaction mutation.
  return {
    _id: syntheticId,
    _creationTime: 0,
    userId: account.userId,
    accountId: occurrence.accountId,
    providerConnectionId: account.providerConnectionId,
    provider: account.provider,
    dedupeKey: syntheticId,
    status: 'SCHD',
    direction: occurrence.direction === 'outflow' ? 'DBIT' : 'CRDT',
    amount: occurrence.amount,
    bookingDate: occurrence.dueDate,
    description: occurrence.name,
    counterpartyName: occurrence.description,
    note: occurrence.note,
    classificationKind: occurrence.direction === 'outflow' ? 'expense' : 'income',
    classificationSource: 'user',
    categoryId: occurrence.categoryId,
    importedAtMs: 0,
    updatedAtMs: 0,
    account,
    category,
    plannedOccurrence: {
      plannedTransactionId: occurrence.plannedTransactionId,
      dueDate: occurrence.dueDate,
      recurrence: occurrence.recurrence,
      recurrenceLabel,
    },
  } as TransactionRow;
}

const MAX_TRANSACTION_SCAN = 5000;
const MAX_SCHEDULED_ROWS = 50;

function querySortField(sortKey: TransactionSortKey) {
  if (sortKey === 'counterpartyName') return 'payee' as const;
  if (sortKey === 'classificationKind') return 'classification' as const;
  if (sortKey === 'outflow' || sortKey === 'inflow') return 'amount' as const;
  return sortKey;
}

function isoDateDistanceDays(left: string, right: string) {
  const leftMs = new Date(`${left}T00:00:00.000Z`).getTime();
  const rightMs = new Date(`${right}T00:00:00.000Z`).getTime();
  return Math.abs(Math.round((leftMs - rightMs) / (24 * 60 * 60 * 1000)));
}

type TransactionsViewProps = {
  filterQuery: string;
  onSearchChange: (query: string, sort: TransactionSortKey, direction: TransactionSortDirection) => void;
  scopeAccountId?: Id<'financialAccounts'>;
  sortDirection: TransactionSortDirection;
  sortKey: TransactionSortKey;
};

export function TransactionsView({
  filterQuery,
  onSearchChange,
  scopeAccountId,
  sortDirection,
  sortKey,
}: TransactionsViewProps) {
  const { intlLocale, t } = useI18n();
  const navigate = useNavigate();
  const { isPending, run } = usePendingAction();
  const [selectedTransfer, setSelectedTransfer] = React.useState<Transaction | null>(null);
  const [selectedInstallmentTransaction, setSelectedInstallmentTransaction] = React.useState<Transaction | null>(null);
  const [selectedInstallmentOptionKey, setSelectedInstallmentOptionKey] = React.useState<string>('');
  const [selectedInstallmentDueDate, setSelectedInstallmentDueDate] = React.useState<string>('');
  const [selectedDetailTransaction, setSelectedDetailTransaction] = React.useState<TransactionRow | null>(null);
  const [moneyBoxTransaction, setMoneyBoxTransaction] = React.useState<TransactionRow | null>(null);
  const [editorMode, setEditorMode] = React.useState<InlineTransactionEditorMode | null>(null);
  const [scheduledReconcileTransaction, setScheduledReconcileTransaction] = React.useState<Transaction | null>(null);
  const [counterpartTransaction, setCounterpartTransaction] = React.useState<Transaction | null>(null);
  const [manageTagsOpen, setManageTagsOpen] = React.useState(false);
  const [editingManualTransaction, setEditingManualTransaction] = React.useState<Transaction | null>(null);
  const [pageIndex, setPageIndex] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(20);
  const sorting = React.useMemo<SortingState>(
    () => [{ id: sortKey, desc: sortDirection === 'desc' }],
    [sortDirection, sortKey],
  );

  React.useEffect(() => {
    setPageIndex(0);
  }, [filterQuery, scopeAccountId, sortDirection, sortKey]);

  const { data: categoryList } = useSuspenseQuery(convexQuery(api.banking.categories.listCategories, { limit: 100 }));
  const { data: accountList } = useSuspenseQuery(
    convexQuery(api.banking.accounts.listAccounts, {
      status: 'active',
      includeIds: scopeAccountId ? [scopeAccountId] : undefined,
    }),
  );
  const { data: reviewSuggestions } = useSuspenseQuery(
    convexQuery(api.banking.transactions.listReviewSuggestions, { limit: 12 }),
  );
  const filterLabels = React.useMemo<FilterQueryContext['labels']>(
    () => ({
      account: t('transactions.filter.account'),
      category: t('transactions.filter.category'),
      payee: t('transactions.filter.payee'),
      classification: t('transactions.filter.classification'),
      status: t('transactions.filter.status'),
      on: t('transactions.filter.on'),
      before: t('transactions.filter.before'),
      after: t('transactions.filter.after'),
      outflow: t('transactions.filter.outflow'),
      inflow: t('transactions.filter.inflow'),
      equals: t('transactions.filter.equals'),
      atLeast: t('transactions.filter.atLeast'),
      atMost: t('transactions.filter.atMost'),
      findAny: t('transactions.filter.findAny', { value: '{value}' }),
      findPayee: t('transactions.filter.findPayee', { value: '{value}' }),
      findCategory: t('transactions.filter.findCategory', { value: '{value}' }),
      findMemo: t('transactions.filter.findMemo', { value: '{value}' }),
    }),
    [t],
  );
  const baseFilterContext = React.useMemo<FilterQueryContext>(
    () => ({
      accounts: scopeAccountId
        ? []
        : accountList.map((account) => ({ accountId: account._id, label: accountLabel(account) })),
      categories: categoryList.map((category) => ({
        categoryId: category._id,
        label: categoryDisplayName(category, t),
      })),
      payees: [],
      locale: intlLocale,
      currency: accountList.at(0)?.currency ?? 'EUR',
      today: new Date().toISOString().slice(0, 10),
      labels: filterLabels,
    }),
    [accountList, categoryList, filterLabels, intlLocale, scopeAccountId, t],
  );
  const transactionFilters = React.useMemo(() => {
    const filters = toTransactionFilters(parseFilterQuery(filterQuery, baseFilterContext).clauses);
    return scopeAccountId ? { ...filters, accountId: scopeAccountId } : filters;
  }, [baseFilterContext, filterQuery, scopeAccountId]);
  const transactionPageQueryArgs = React.useMemo(
    () => ({
      filters: transactionFilters,
      sort: { field: querySortField(sortKey), direction: sortDirection },
      limit: pageSize,
      offset: pageIndex * pageSize,
    }),
    [pageIndex, pageSize, sortDirection, sortKey, transactionFilters],
  );
  const transactionPage = useAuthedQuery(api.banking.transactions.listTransactionsPage, transactionPageQueryArgs);
  // The scheduled band is the same page query narrowed to SCHD. A status typed into the filter box
  // wins: asking for booked rows should not leave a band of plans hanging above them.
  const scheduledPageQueryArgs = React.useMemo(
    () =>
      transactionFilters.status && transactionFilters.status !== 'SCHD'
        ? ('skip' as const)
        : {
            filters: { ...transactionFilters, status: 'SCHD' as const },
            sort: { field: 'bookingDate' as const, direction: 'asc' as const },
            limit: MAX_SCHEDULED_ROWS,
            offset: 0,
          },
    [transactionFilters],
  );
  const scheduledPage = useAuthedQuery(api.banking.transactions.listTransactionsPage, scheduledPageQueryArgs);
  const plannedOccurrenceQueryArgs = React.useMemo(
    () =>
      transactionFilters.status && transactionFilters.status !== 'SCHD'
        ? ('skip' as const)
        : { accountId: transactionFilters.accountId },
    [transactionFilters.accountId, transactionFilters.status],
  );
  const plannedOccurrences = useAuthedQuery(
    api.banking.planning.listNextLedgerPlannedOccurrences,
    plannedOccurrenceQueryArgs,
  );
  const installmentLinkOptions = useAuthedQuery(
    api.banking.credit.listInstallmentLinkOptions,
    selectedInstallmentTransaction ? { transactionId: selectedInstallmentTransaction._id } : 'skip',
  );
  const selectedInstallmentOption = React.useMemo(
    () => installmentLinkOptions?.find((option) => option.key === selectedInstallmentOptionKey) ?? null,
    [installmentLinkOptions, selectedInstallmentOptionKey],
  );
  const installmentPlanPayments = useAuthedQuery(
    api.banking.credit.listInstallmentPlanPayments,
    selectedInstallmentOption?.kind === 'single'
      ? { installmentPlanId: selectedInstallmentOption.plan._id }
      : 'skip',
  );
  const tags = useAuthedQuery(api.banking.transactionMeta.listTags, {});

  const candidates = useAuthedQuery(
    api.banking.transactions.findTransferCandidates,
    selectedTransfer ? { transactionId: selectedTransfer._id, daysWindow: 7, toleranceMinor: 300n, limit: 10 } : 'skip',
  );
  const accountById = React.useMemo(() => new Map(accountList.map((account) => [account._id, account])), [accountList]);
  const categoryById = React.useMemo(
    () => new Map(categoryList.map((category) => [category._id, category])),
    [categoryList],
  );
  const toTransactionRow = React.useCallback(
    (transaction: TransactionPageRow): TransactionRow => ({
      ...transaction,
      account: accountById.get(transaction.accountId) ?? null,
      category: transaction.categoryId ? (categoryById.get(transaction.categoryId) ?? null) : null,
    }),
    [accountById, categoryById],
  );
  // Without a status clause, scheduled rows live only in their own band. An explicit status filter
  // wins because the table is then the requested result set, including SCHD.
  const transactionRows = React.useMemo<Array<TransactionRow>>(
    () => transactionPageRowsForTable(transactionPage?.rows ?? [], transactionFilters.status).map(toTransactionRow),
    [toTransactionRow, transactionFilters.status, transactionPage?.rows],
  );
  const plannedOccurrenceRows = React.useMemo<Array<TransactionRow>>(
    () =>
      (plannedOccurrences ?? []).flatMap((occurrence) => {
        const account = accountById.get(occurrence.accountId);
        if (!account) {
          return [];
        }

        return [
          createPlannedOccurrenceTransactionRow({
            occurrence,
            account,
            category: occurrence.categoryId ? (categoryById.get(occurrence.categoryId) ?? null) : null,
            recurrenceLabel: plannedOccurrenceRecurrenceLabel(occurrence, t),
          }),
        ];
      }),
    [accountById, categoryById, plannedOccurrences, t],
  );
  const scheduledRows = React.useMemo<Array<TransactionRow>>(
    () =>
      [...(scheduledPage?.rows ?? []).map(toTransactionRow), ...plannedOccurrenceRows].toSorted(
        (left, right) => left.bookingDate.localeCompare(right.bookingDate) || left._id.localeCompare(right._id),
      ),
    [plannedOccurrenceRows, scheduledPage?.rows, toTransactionRow],
  );
  const filterContext = React.useMemo<FilterQueryContext>(
    () => ({
      ...baseFilterContext,
      payees: transactionRows.flatMap((transaction) => {
        const payee = transaction.counterpartyName?.trim();
        return payee ? [payee] : [];
      }),
    }),
    [baseFilterContext, transactionRows],
  );

  const convertToSubscription = useMutation(api.subscriptions.convertTransactionToSubscription);
  const rejectSubscriptionSuggestion = useMutation(api.banking.transactions.rejectSubscriptionSuggestion);
  const setCategory = useMutation(api.banking.transactions.setCategory).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.banking.transactions.listTransactionsPage, transactionPageQueryArgs);
    if (!current) return;

    const category = args.categoryId
      ? (categoryList.find((candidate) => candidate._id === args.categoryId) ?? null)
      : null;
    const now = Date.now();
    localStore.setQuery(api.banking.transactions.listTransactionsPage, transactionPageQueryArgs, {
      ...current,
      rows: current.rows.map((transaction) =>
        optimisticallyAssignTransactionCategory(
          transaction,
          args.transactionId,
          args.categoryId,
          category,
          now,
        ),
      ),
    });
  });
  const setClassification = useMutation(api.banking.transactions.setClassification);
  const createCategoryRule = useMutation(api.banking.categoryRules.createRule);
  const confirmInstallmentPaymentTransaction = useMutation(api.banking.credit.confirmInstallmentPaymentTransaction);
  const confirmInstallmentPaymentTransactionBatch = useMutation(
    api.banking.credit.confirmInstallmentPaymentTransactionBatch,
  );
  const createTransferMatch = useMutation(api.banking.transfers.createManualTransferMatch);
  const confirmTransferCandidate = useMutation(api.banking.transfers.confirmTransferCandidate);
  const rejectTransferCandidate = useMutation(api.banking.transfers.rejectTransferCandidate);
  const rejectManualTransferCandidate = useMutation(api.banking.transfers.rejectManualTransferCandidate);
  const unlinkTransferMatch = useMutation(api.banking.transfers.unlinkTransferMatch);
  const unlinkMoneyBoxContribution = useMutation(api.banking.planning.unlinkMoneyBoxContribution);
  const deleteManualTransaction = useMutation(api.banking.manualTransactions.deleteManualTransaction);
  const bulkSetTags = useMutation(api.banking.transactionMeta.bulkSetTags);
  const bulkSetHidden = useMutation(api.banking.transactionMeta.bulkSetHidden);
  const markOccurrencePaid = useMutation(api.banking.planning.markPlannedExpenseOccurrencePaid);

  React.useEffect(() => {
    if (!selectedInstallmentTransaction || !installmentPlanPayments) {
      return;
    }

    setSelectedInstallmentDueDate((currentDueDate) => {
      const currentPayment = installmentPlanPayments.find((payment) => payment.scheduledDueDate === currentDueDate);
      if (
        currentPayment &&
        (!currentPayment.isLinked || currentPayment.transactionId === selectedInstallmentTransaction._id)
      ) {
        return currentDueDate;
      }

      const closestPayment = installmentPlanPayments
        .filter((payment) => !payment.isLinked || payment.transactionId === selectedInstallmentTransaction._id)
        .sort(
          (left, right) =>
            isoDateDistanceDays(left.scheduledDueDate, selectedInstallmentTransaction.bookingDate) -
              isoDateDistanceDays(right.scheduledDueDate, selectedInstallmentTransaction.bookingDate) ||
            left.scheduledDueDate.localeCompare(right.scheduledDueDate),
        )
        .at(0);

      return closestPayment?.scheduledDueDate ?? '';
    });
  }, [installmentPlanPayments, selectedInstallmentTransaction]);

  const markSubscription = React.useCallback(
    (transaction: Transaction) => {
      void run(
        `subscription:${transaction._id}`,
        async () => {
          await convertToSubscription({
            transactionId: transaction._id,
            interval: 'month',
            intervalCount: 1,
          });
          trackEvent(analyticsEvents.subscriptionSuggestionAccepted, { surface: 'transactions' });
        },
        {
          success: t('transactions.toast.subscriptionConverted'),
          error: t('transactions.toast.subscriptionConvertFailed'),
        },
      );
    },
    [convertToSubscription, run, t],
  );

  const rejectSubscription = React.useCallback(
    (transaction: Transaction) => {
      void run(
        `reject-subscription:${transaction._id}`,
        async () => {
          await rejectSubscriptionSuggestion({
            transactionId: transaction._id,
          });
          trackEvent(analyticsEvents.subscriptionSuggestionRejected, { surface: 'transactions' });
        },
        {
          success: t('transactions.toast.subscriptionRejected'),
          error: t('transactions.toast.subscriptionRejectFailed'),
        },
      );
    },
    [rejectSubscriptionSuggestion, run, t],
  );

  const assignCategory = React.useCallback(
    async (transaction: Transaction, categoryId: Id<'categories'> | null) => {
      const ok = await run(
        `category:${transaction._id}`,
        async () => {
          if (categoryId) {
            await setCategory({ transactionId: transaction._id, categoryId });
          } else {
            await setCategory({ transactionId: transaction._id });
          }
        },
        { error: t('transactions.toast.categoryUpdateFailed') },
      );

      if (!ok) {
        return;
      }

      trackEvent(analyticsEvents.transactionCategorized, { surface: 'transactions' });

      const merchantPattern = transaction.counterpartyName?.trim();
      if (categoryId && merchantPattern) {
        toast.success(t('transactions.toast.categoryUpdated'), {
          action: {
            label: t('transactions.rules.create'),
            onClick: () => {
              void createCategoryRule({
                matchField: 'merchant',
                matchType: 'contains',
                pattern: merchantPattern,
                categoryId,
              })
                .then(() => toast.success(t('settings.categoryRules.created')))
                .catch((error) => {
                  toast.error(error instanceof Error ? error.message : t('settings.categoryRules.createFailed'));
                });
            },
          },
        });
      } else {
        toast.success(t('transactions.toast.categoryUpdated'));
      }
    },
    [createCategoryRule, run, setCategory, t],
  );

  const markExpense = React.useCallback(
    (transaction: Transaction) => {
      void run(
        `classification:${transaction._id}`,
        async () => {
          await setClassification({
            transactionId: transaction._id,
            classificationKind: 'expense',
            categoryId: transaction.categoryId,
            confidence: 1,
          });
        },
        { success: t('transactions.toast.markedExpense'), error: t('transactions.toast.updateFailed') },
      );
    },
    [run, setClassification, t],
  );

  const markIncome = React.useCallback(
    (transaction: Transaction) => {
      void run(
        `classification:${transaction._id}`,
        async () => {
          await setClassification({
            transactionId: transaction._id,
            classificationKind: 'income',
            categoryId: transaction.categoryId,
            confidence: 1,
          });
        },
        { success: t('transactions.toast.markedIncome'), error: t('transactions.toast.updateFailed') },
      );
    },
    [run, setClassification, t],
  );

  const editManualTransaction = React.useCallback((transaction: Transaction) => {
    setEditingManualTransaction(transaction);
  }, []);

  const startCounterpartTransfer = React.useCallback((transaction: Transaction) => {
    setCounterpartTransaction(transaction);
  }, []);

  const removeManualTransaction = React.useCallback(
    (transaction: Transaction) => {
      if (!window.confirm(t('transactions.manual.confirmDelete'))) {
        return;
      }

      void run(
        `manual-delete:${transaction._id}`,
        async () => {
          await deleteManualTransaction({ transactionId: transaction._id });
        },
        {
          success: t('transactions.manual.deleted'),
          error: t('transactions.manual.deleteFailed'),
          getErrorMessage: (error) => {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes('transfer match')) return t('transactions.manual.deleteBlocked.transfer');
            if (message.includes('planned expense')) return t('transactions.manual.deleteBlocked.planning');
            if (message.includes('installment') || message.includes('card statement')) {
              return t('transactions.manual.deleteBlocked.credit');
            }
            if (message.includes('money box')) return t('transactions.manual.deleteBlocked.moneyBox');
            if (message.includes('subscription')) return t('transactions.manual.deleteBlocked.subscription');
            return t('transactions.manual.deleteFailed');
          },
        },
      );
    },
    [deleteManualTransaction, run, t],
  );

  const unlinkTransfer = React.useCallback(
    (transaction: TransactionRow) => {
      const transferMatchId = transaction.transferPresentation?.matchId;
      if (!transferMatchId) {
        return;
      }

      if (!window.confirm(t('transactions.action.confirmUnlinkTransfer'))) {
        return;
      }

      void run(
        `unlink-transfer:${transferMatchId}`,
        async () => {
          await unlinkTransferMatch({ transferMatchId });
        },
        {
          success: t('transactions.toast.transferUnlinked'),
          error: t('transactions.toast.transferUnlinkFailed'),
          getErrorMessage: (error) => {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes('planned transfer')) return t('transactions.toast.transferUnlinkBlockedPlan');
            return t('transactions.toast.transferUnlinkFailed');
          },
        },
      );
    },
    [run, t, unlinkTransferMatch],
  );

  const unlinkMoneyBox = React.useCallback(
    (transaction: TransactionRow) => {
      if (!transaction.transferPresentation?.moneyBoxId) {
        return;
      }

      if (!window.confirm(t('transactions.moneyBox.confirmUnlink'))) {
        return;
      }

      void run(
        `unlink-money-box:${transaction._id}`,
        async () => {
          await unlinkMoneyBoxContribution({ transactionId: transaction._id });
        },
        {
          success: t('transactions.moneyBox.unlinked'),
          error: t('transactions.moneyBox.unlinkFailed'),
          getErrorMessage: (error) => {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes('enough saved funds')) return t('transactions.moneyBox.unlinkBlockedFunds');
            return t('transactions.moneyBox.unlinkFailed');
          },
        },
      );
    },
    [run, t, unlinkMoneyBoxContribution],
  );

  const markInternal = React.useCallback(
    (transaction: Transaction) => {
      void run(
        `classification:${transaction._id}`,
        async () => {
          await setClassification({
            transactionId: transaction._id,
            classificationKind: 'internal',
            categoryId: transaction.categoryId,
            confidence: 1,
          });
        },
        { success: t('transactions.toast.markedInternal'), error: t('transactions.toast.updateFailed') },
      );
    },
    [run, setClassification, t],
  );

  const markUnmatchedTransfer = React.useCallback(
    (transaction: Transaction) => {
      void run(
        `classification:${transaction._id}`,
        async () => {
          await setClassification({
            transactionId: transaction._id,
            classificationKind: 'transfer',
            categoryId: transaction.categoryId,
            confidence: 1,
          });
        },
        { success: t('transactions.toast.markedTransfer'), error: t('transactions.toast.updateFailed') },
      );
    },
    [run, setClassification, t],
  );

  const matchTransfer = React.useCallback(
    (candidate: Transaction) => {
      if (!selectedTransfer) {
        return;
      }

      const outgoingTransactionId = selectedTransfer.direction === 'DBIT' ? selectedTransfer._id : candidate._id;
      const incomingTransactionId = selectedTransfer.direction === 'CRDT' ? selectedTransfer._id : candidate._id;

      void run(
        `match-transfer:${candidate._id}`,
        async () => {
          await createTransferMatch({
            outgoingTransactionId,
            incomingTransactionId,
          });
          setSelectedTransfer(null);
          trackEvent(analyticsEvents.transferMatched, { surface: 'transactions', mode: 'manual' });
        },
        { success: t('transactions.toast.transferMatched'), error: t('transactions.toast.transferMatchFailed') },
      );
    },
    [createTransferMatch, run, selectedTransfer, t],
  );

  const confirmTransferPair = React.useCallback(
    (args: { transferMatchId?: Id<'transferMatches'>; outgoing: Transaction; incoming: Transaction }) => {
      const key = `confirm-transfer:${args.transferMatchId ?? `${args.outgoing._id}:${args.incoming._id}`}`;
      void run(
        key,
        async () => {
          if (args.transferMatchId) {
            await confirmTransferCandidate({ transferMatchId: args.transferMatchId });
            trackEvent(analyticsEvents.transferMatched, { surface: 'transactions', mode: 'suggested' });
          } else {
            await createTransferMatch({
              outgoingTransactionId: args.outgoing._id,
              incomingTransactionId: args.incoming._id,
            });
            trackEvent(analyticsEvents.transferMatched, { surface: 'transactions', mode: 'manual' });
          }
        },
        { success: t('transactions.toast.transferMatched'), error: t('transactions.toast.transferMatchFailed') },
      );
    },
    [confirmTransferCandidate, createTransferMatch, run, t],
  );

  const rejectTransferPair = React.useCallback(
    async (transferMatchId: Id<'transferMatches'>) => {
      await run(
        `reject-transfer:${transferMatchId}`,
        async () => {
          await rejectTransferCandidate({ transferMatchId });
        },
        { success: t('transactions.toast.transferRejected'), error: t('transactions.toast.transferRejectFailed') },
      );
    },
    [rejectTransferCandidate, run, t],
  );

  const rejectSuggestedTransferPair = React.useCallback(
    (args: { transferMatchId?: Id<'transferMatches'>; outgoing: Transaction; incoming: Transaction }) => {
      if (args.transferMatchId) {
        void rejectTransferPair(args.transferMatchId);
        return;
      }

      const key = `reject-transfer:${args.outgoing._id}:${args.incoming._id}`;
      void run(
        key,
        async () => {
          await rejectManualTransferCandidate({
            outgoingTransactionId: args.outgoing._id,
            incomingTransactionId: args.incoming._id,
          });
        },
        { success: t('transactions.toast.transferRejected'), error: t('transactions.toast.transferRejectFailed') },
      );
    },
    [rejectManualTransferCandidate, rejectTransferPair, run, t],
  );

  const confirmInstallmentMatch = React.useCallback(() => {
    if (!selectedInstallmentTransaction || !selectedInstallmentOption) {
      return;
    }

    const option = selectedInstallmentOption;
    if (option.kind === 'single' && !selectedInstallmentDueDate) {
      return;
    }

    void run(
      'installment-match',
      async () => {
        if (option.kind === 'aggregate') {
          // One debit repaying several plans of the same facility is booked across
          // them in a single call, the way the Credit panel confirms it.
          await confirmInstallmentPaymentTransactionBatch({
            transactionId: selectedInstallmentTransaction._id,
            allocations: option.allocations.map((allocation) => ({
              installmentPlanId: allocation.plan._id,
              amount: allocation.expectedAmount,
              scheduledDueDate: allocation.scheduledDueDate,
            })),
          });
        } else {
          await confirmInstallmentPaymentTransaction({
            transactionId: selectedInstallmentTransaction._id,
            installmentPlanId: option.plan._id,
            scheduledDueDate: selectedInstallmentDueDate,
          });
        }
        setSelectedInstallmentTransaction(null);
        setSelectedInstallmentOptionKey('');
        setSelectedInstallmentDueDate('');
      },
      { success: t('transactions.toast.installmentLinked'), error: t('transactions.toast.installmentLinkFailed') },
    );
  }, [
    confirmInstallmentPaymentTransaction,
    confirmInstallmentPaymentTransactionBatch,
    run,
    selectedInstallmentDueDate,
    selectedInstallmentOption,
    selectedInstallmentTransaction,
    t,
  ]);

  const updateBulkTags = React.useCallback(
    async (transactions: Array<TransactionRow>, tagIds: Array<Id<'transactionTags'>>, mode: 'add' | 'remove') =>
      run(
        `bulk-tags:${mode}`,
        async () => {
          const result = await bulkSetTags({
            transactionIds: transactions.map((transaction) => transaction._id),
            ...(mode === 'add' ? { addTagIds: tagIds } : { removeTagIds: tagIds }),
          });
          if (result.skipped.length > 0) {
            throw new Error(t('transactions.bulk.partial', { count: result.skipped.length }));
          }
          trackEvent(analyticsEvents.transactionTagged, { surface: 'transactions', mode: 'bulk' });
        },
        {
          success: mode === 'add' ? t('transactions.bulk.tagsAdded') : t('transactions.bulk.tagsRemoved'),
          error: t('transactions.bulk.failed'),
        },
      ),
    [bulkSetTags, run, t],
  );

  const updateBulkHidden = React.useCallback(
    async (transactions: Array<TransactionRow>, hidden: boolean) =>
      run(
        `bulk-hidden:${hidden}`,
        async () => {
          await bulkSetHidden({
            transactionIds: transactions.map((transaction) => transaction._id),
            hidden,
          });
        },
        {
          success: hidden ? t('transactions.bulk.hidden') : t('transactions.bulk.unhidden'),
          error: t('transactions.bulk.failed'),
        },
      ),
    [bulkSetHidden, run, t],
  );

  // One mutation per row: only tags and visibility have a batch endpoint, and writing four more would
  // not make these any less sequential. A row that fails does not stop the others; the count of
  // failures is reported at the end, so the user knows the batch was partial instead of assuming it
  // all went through.
  const runPerRow = React.useCallback(
    async (
      key: string,
      transactions: Array<TransactionRow>,
      action: (transaction: TransactionRow) => Promise<unknown>,
      success: string,
    ) =>
      run(
        key,
        async () => {
          let failed = 0;
          for (const transaction of transactions) {
            try {
              await action(transaction);
            } catch {
              failed += 1;
            }
          }
          if (failed > 0) {
            throw new Error(t('transactions.bulk.partialFailed', { count: failed }));
          }
        },
        {
          success,
          error: t('transactions.bulk.failed'),
          // The count of failures is the point of the loop; the generic message would swallow it.
          getErrorMessage: (error) =>
            error instanceof Error && error.message ? error.message : t('transactions.bulk.failed'),
        },
      ),
    [run, t],
  );

  const updateBulkCategory = React.useCallback(
    async (transactions: Array<TransactionRow>, categoryId: Id<'categories'> | null) =>
      runPerRow(
        'bulk-category',
        transactions,
        (transaction) =>
          categoryId
            ? setCategory({ transactionId: transaction._id, categoryId })
            : setCategory({ transactionId: transaction._id }),
        t('transactions.toast.categoryUpdated'),
      ),
    [runPerRow, setCategory, t],
  );

  const updateBulkClassification = React.useCallback(
    async (transactions: Array<TransactionRow>, classificationKind: 'expense' | 'income' | 'internal' | 'transfer') =>
      runPerRow(
        `bulk-classification:${classificationKind}`,
        transactions,
        (transaction) =>
          setClassification({
            transactionId: transaction._id,
            classificationKind,
            categoryId: transaction.categoryId,
            confidence: 1,
          }),
        t('transactions.bulk.classified'),
      ),
    [runPerRow, setClassification, t],
  );

  const updateBulkUnlinkTransfer = React.useCallback(
    async (transactions: Array<TransactionRow>) =>
      runPerRow(
        'bulk-unlink-transfer',
        transactions.filter((transaction) => transaction.transferPresentation?.matchId),
        (transaction) => {
          const transferMatchId = transaction.transferPresentation?.matchId;
          if (!transferMatchId) return Promise.resolve();
          return unlinkTransferMatch({ transferMatchId });
        },
        t('transactions.toast.transferUnlinked'),
      ),
    [runPerRow, t, unlinkTransferMatch],
  );

  const updateBulkUnlinkMoneyBox = React.useCallback(
    async (transactions: Array<TransactionRow>) =>
      runPerRow(
        'bulk-unlink-money-box',
        transactions.filter((transaction) => transaction.transferPresentation?.moneyBoxId),
        (transaction) => unlinkMoneyBoxContribution({ transactionId: transaction._id }),
        t('transactions.moneyBox.unlinked'),
      ),
    [runPerRow, t, unlinkMoneyBoxContribution],
  );

  const removeBulkManualTransactions = React.useCallback(
    async (transactions: Array<TransactionRow>) => {
      const manual = transactions.filter((transaction) => transaction.provider === 'manual');
      if (manual.length === 0) return false;
      if (!window.confirm(t('transactions.bulk.confirmDelete', { count: manual.length }))) return false;
      return runPerRow(
        'bulk-delete-manual',
        manual,
        (transaction) => deleteManualTransaction({ transactionId: transaction._id }),
        t('transactions.manual.deleted'),
      );
    },
    [deleteManualTransaction, runPerRow, t],
  );

  const payPlannedOccurrence = React.useCallback(
    (occurrence: PlannedOccurrenceRow) => {
      void run(
        `planned-occurrence:${occurrence.plannedTransactionId}:${occurrence.dueDate}`,
        async () => {
          await markOccurrencePaid({
            plannedExpenseId: occurrence.plannedTransactionId,
            dueDate: occurrence.dueDate,
          });
        },
        {
          success: t('planning.expenses.occurrenceUpdated'),
          error: t('planning.expenses.occurrenceUpdateFailed'),
        },
      );
    },
    [markOccurrencePaid, run, t],
  );
  const openPlanning = React.useCallback(() => {
    void navigate({ to: '/app/planning' });
  }, [navigate]);

  const columns = React.useMemo(
    () =>
      createTransactionColumns({
        categories: categoryList,
        intlLocale,
        tags: tags ?? [],
        translate: t,
        labels: {
          account: t('transactions.table.account'),
          actions: t('transactions.table.actions'),
          associateMoneyBox: t('transactions.moneyBox.associate'),
          category: t('transactions.table.category'),
          categoryNotNeeded: t('transactions.category.notNeeded'),
          categoryTransfers: t('transactions.category.transfers'),
          categoryUncategorized: t('transactions.category.uncategorized'),
          changeMoneyBox: t('transactions.moneyBox.change'),
          classification: t('transactions.table.classification'),
          copyId: t('transactions.action.copyId'),
          creditPlans: t('transactions.table.creditPlans'),
          date: t('transactions.table.date'),
          deleteManual: t('transactions.manual.delete'),
          description: t('transactions.table.description'),
          editManual: t('transactions.manual.edit'),
          expense: t('transactions.action.expense'),
          hiddenFromReports: t('transactions.hidden.label'),
          income: t('transactions.action.income'),
          inflow: t('transactions.table.inflow'),
          internal: t('transactions.action.internal'),
          installmentPayment: t('transactions.action.installmentPayment'),
          matchTransfer: t('transactions.action.matchTransfer'),
          memo: t('transactions.table.memo'),
          outflow: t('transactions.table.outflow'),
          payee: t('transactions.table.payee'),
          createCounterpart: t('transactions.action.createCounterpart'),
          unlinkMoneyBox: t('transactions.moneyBox.unlink'),
          unlinkTransfer: t('transactions.action.unlinkTransfer'),
          unmatchedTransfer: t('transactions.action.unmatchedTransfer'),
          transferDetails: t('transactions.transfer.details'),
          transferPayee: t('transactions.transfer.payee'),
          unknownDestination: t('transactions.transfer.unknownDestination'),
          unknownSource: t('transactions.transfer.unknownSource'),
          openMenu: t('transactions.action.openMenu'),
          openPlanning: t('transactions.scheduled.openPlanning'),
          plannedMarkPaid: t('transactions.scheduled.markPaid'),
          reconcileScheduled: t('transactions.scheduled.reconcile'),
          repeatMarker: t('transactions.scheduled.repeatMarker', { recurrence: '{recurrence}' }),
          selectAll: t('transactions.table.selectAll'),
          selectRow: t('transactions.table.selectRow'),
          subscription: t('transactions.action.subscription'),
          tagOverflow: t('transactions.tags.overflow', { count: '{count}' }),
        },
        actions: {
          onAssignCategory: assignCategory,
          onDeleteManualTransaction: removeManualTransaction,
          onEditManualTransaction: editManualTransaction,
          onMarkExpense: markExpense,
          onMarkIncome: markIncome,
          onMarkInternal: markInternal,
          onMarkUnmatchedTransfer: markUnmatchedTransfer,
          onMarkSubscription: markSubscription,
          onMarkPlannedOccurrencePaid: payPlannedOccurrence,
          onOpenPlanning: openPlanning,
          onReconcileScheduled: setScheduledReconcileTransaction,
          onStartInstallmentMatch: (transaction) => {
            setSelectedInstallmentTransaction(transaction);
            setSelectedInstallmentOptionKey('');
            setSelectedInstallmentDueDate('');
          },
          onStartTransferMatch: (transaction) => setSelectedTransfer(transaction),
          onStartCounterpartTransfer: startCounterpartTransfer,
          onUnlinkTransfer: unlinkTransfer,
          onStartMoneyBoxAssociation: setMoneyBoxTransaction,
          onUnlinkMoneyBox: unlinkMoneyBox,
        },
      }),
    [
      assignCategory,
      categoryList,
      editManualTransaction,
      intlLocale,
      markExpense,
      markIncome,
      markInternal,
      markSubscription,
      markUnmatchedTransfer,
      openPlanning,
      payPlannedOccurrence,
      removeManualTransaction,
      startCounterpartTransfer,
      t,
      tags,
      unlinkMoneyBox,
      unlinkTransfer,
    ],
  );

  const tableLabels = React.useMemo(
    () => ({
      account: t('transactions.table.account'),
      actions: t('transactions.table.actions'),
      category: t('transactions.table.category'),
      classification: t('transactions.table.classification'),
      clearFilters: t('transactions.filter.clear'),
      columns: t('transactions.table.columns'),
      date: t('transactions.table.date'),
      description: t('transactions.table.description'),
      destination: t('transactions.transfer.destination'),
      feeDelta: t('transactions.transfer.feeDelta'),
      filterNoSuggestions: t('transactions.filter.noSuggestions'),
      filterPlaceholder: t('transactions.filter.search'),
      inflow: t('transactions.table.inflow'),
      loading: t('transactions.table.loading'),
      memo: t('transactions.table.memo'),
      netTransfer: t('transactions.transfer.netTransfer'),
      next: t('transactions.pagination.next'),
      noResults: t('transactions.table.empty'),
      outflow: t('transactions.table.outflow'),
      page: t('transactions.pagination.pageOf', { page: '{page}', pages: '{pages}' }),
      pageSize: t('transactions.pagination.pageSize'),
      payee: t('transactions.table.payee'),
      previous: t('transactions.pagination.previous'),
      rowsSelected: t('transactions.table.rowsSelected'),
      scanCapped: t('transactions.pagination.scanCapped', { count: '{count}' }),
      scheduledCollapse: t('transactions.scheduled.collapse'),
      scheduledCount: t('transactions.scheduled.count', { count: '{count}' }),
      scheduledExpand: t('transactions.scheduled.expand'),
      scheduledTitle: t('transactions.scheduled.title'),
      select: t('transactions.table.selectRow'),
      source: t('transactions.transfer.source'),
      transferDetails: t('transactions.transfer.details'),
      unknownDestination: t('transactions.transfer.unknownDestination'),
      unknownSource: t('transactions.transfer.unknownSource'),
    }),
    [t],
  );

  const reviewLabels = React.useMemo(
    () => ({
      account: t('transactions.review.detail.account'),
      amount: t('transactions.review.detail.amount'),
      bookingDate: t('transactions.review.detail.bookingDate'),
      classification: t('transactions.review.detail.classification'),
      compare: t('transactions.review.compare'),
      confirm: t('transactions.confirm'),
      confirmMatch: t('transactions.confirmMatch'),
      counterparty: t('transactions.review.detail.counterparty'),
      details: t('transactions.review.detail.details'),
      direction: t('transactions.review.detail.direction'),
      empty: t('transactions.review.empty'),
      importedAt: t('transactions.review.detail.importedAt'),
      incomingTransaction: t('transactions.review.incomingTransaction'),
      outgoingTransaction: t('transactions.review.outgoingTransaction'),
      possibleSubscription: t('transactions.review.possibleSubscription', { description: '{description}' }),
      possibleTransfer: t('transactions.review.possibleTransfer'),
      provider: t('transactions.review.detail.provider'),
      providerEntryReference: t('transactions.review.detail.providerEntryReference'),
      providerTransactionId: t('transactions.review.detail.providerTransactionId'),
      referenceNumber: t('transactions.review.detail.referenceNumber'),
      reject: t('transactions.reject'),
      remittance: t('transactions.review.detail.remittance'),
      savedCandidateBadge: t('transactions.review.savedCandidateBadge'),
      status: t('transactions.review.detail.status'),
      subscriptionMeta: t('transactions.review.subscriptionMeta', {
        amount: '{amount}',
        confidence: '{confidence}',
        date: '{date}',
      }),
      title: t('transactions.review.title'),
      transactionDate: t('transactions.review.detail.transactionDate'),
      transferDates: t('transactions.review.transferDates', {
        incomingDate: '{incomingDate}',
        outgoingDate: '{outgoingDate}',
      }),
      transferMeta: t('transactions.review.transferMeta', { amount: '{amount}', confidence: '{confidence}' }),
      valueDate: t('transactions.review.detail.valueDate'),
    }),
    [t],
  );

  const detailLabels = React.useMemo(
    () => ({
      account: t('transactions.review.detail.account'),
      amount: t('transactions.review.detail.amount'),
      bookingDate: t('transactions.review.detail.bookingDate'),
      classification: t('transactions.review.detail.classification'),
      classificationSource: t('transactions.table.classificationSource'),
      counterparty: t('transactions.review.detail.counterparty'),
      date: t('transactions.table.date'),
      description: t('transactions.table.description'),
      destination: t('transactions.transfer.destination'),
      direction: t('transactions.review.detail.direction'),
      feeDelta: t('transactions.transfer.feeDelta'),
      hidden: t('transactions.hidden.label'),
      hiddenDescription: t('transactions.hidden.description'),
      hiddenUpdateFailed: t('transactions.hidden.updateFailed'),
      hiddenUpdated: t('transactions.hidden.updated'),
      importedAt: t('transactions.review.detail.importedAt'),
      metadataTitle: t('transactions.meta.title'),
      netTransfer: t('transactions.transfer.netTransfer'),
      noTags: t('transactions.tags.none'),
      note: t('transactions.note.label'),
      noteDescription: t('transactions.note.description'),
      notePlaceholder: t('transactions.note.placeholder'),
      noteSaveFailed: t('transactions.note.saveFailed'),
      noteSaved: t('transactions.note.saved'),
      provider: t('transactions.review.detail.provider'),
      providerEntryReference: t('transactions.review.detail.providerEntryReference'),
      providerTransactionId: t('transactions.review.detail.providerTransactionId'),
      referenceNumber: t('transactions.review.detail.referenceNumber'),
      remittance: t('transactions.review.detail.remittance'),
      saveNote: t('transactions.note.save'),
      source: t('transactions.transfer.source'),
      status: t('transactions.review.detail.status'),
      tags: t('transactions.tags.label'),
      tagsUpdateFailed: t('transactions.tags.updateFailed'),
      tagsUpdated: t('transactions.tags.updated'),
      title: t('transactions.table.title'),
      transactionDate: t('transactions.review.detail.transactionDate'),
      transferDetails: t('transactions.transfer.details'),
      unknownDestination: t('transactions.transfer.unknownDestination'),
      unknownSource: t('transactions.transfer.unknownSource'),
      valueDate: t('transactions.review.detail.valueDate'),
    }),
    [t],
  );

  const editorAccounts = React.useMemo(
    () => (scopeAccountId ? accountList.filter((account) => account._id === scopeAccountId) : accountList),
    [accountList, scopeAccountId],
  );
  const closeEditor = React.useCallback(() => setEditorMode(null), []);
  const inlineEditor = useInlineTransactionEditor({
    accounts: editorAccounts,
    categories: categoryList,
    mode: editorMode,
    onClose: closeEditor,
    scopeAccountId,
  });

  return (
    <div className="flex flex-col gap-4">
      <ReviewSection
        accountById={accountById}
        intlLocale={intlLocale}
        isPending={isPending}
        labels={reviewLabels}
        onConfirmTransfer={confirmTransferPair}
        onDismissSubscription={rejectSubscription}
        onDismissTransfer={rejectSuggestedTransferPair}
        onMarkSubscription={markSubscription}
        subscriptionCandidates={reviewSuggestions.subscriptionCandidates}
        transferCandidates={reviewSuggestions.transferCandidates}
      />

      <Card size="sm">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle>{t('transactions.table.title')}</CardTitle>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setManageTagsOpen(true)}>
                <TagsIcon data-icon="inline-start" />
                {t('transactions.tags.manage')}
              </Button>
              <Button asChild type="button" variant="outline" size="sm">
                <Link to="/app/import">
                  <FileSpreadsheetIcon data-icon="inline-start" />
                  {t('import.entry')}
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={editorMode !== null}
                onClick={() => setEditorMode({ kind: 'create' })}
              >
                <PlusIcon data-icon="inline-start" />
                {t('transactions.manual.add')}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            accounts={accountList}
            categories={categoryList}
            columns={columns}
            data={transactionRows}
            filterContext={filterContext}
            filterQuery={filterQuery}
            isLoading={transactionPage === undefined}
            labels={tableLabels}
            onBulkCategory={updateBulkCategory}
            onBulkClassification={updateBulkClassification}
            onBulkDeleteManual={removeBulkManualTransactions}
            onBulkHidden={updateBulkHidden}
            onBulkTags={updateBulkTags}
            onBulkUnlinkMoneyBox={updateBulkUnlinkMoneyBox}
            onBulkUnlinkTransfer={updateBulkUnlinkTransfer}
            onFilterQueryChange={(query) => {
              setPageIndex(0);
              onSearchChange(query, sortKey, sortDirection);
            }}
            onPageChange={setPageIndex}
            onPageSizeChange={(nextPageSize) => {
              setPageIndex(0);
              setPageSize(nextPageSize);
            }}
            onRowClick={setSelectedDetailTransaction}
            onScheduledRowClick={(row) => {
              if (row.plannedOccurrence) {
                setEditorMode({ kind: 'plannedRule', row });
                return;
              }
              setScheduledReconcileTransaction(row);
            }}
            onSortingChange={(nextSorting) => {
              const resolved = typeof nextSorting === 'function' ? nextSorting(sorting) : nextSorting;
              const next = resolved.at(0);
              const nextSortKey = isTransactionSortKey(next?.id) ? next.id : 'bookingDate';
              const nextDirection = next?.desc === false ? 'asc' : 'desc';
              setPageIndex(0);
              onSearchChange(filterQuery, nextSortKey, nextDirection);
            }}
            pageIndex={pageIndex}
            pageSize={pageSize}
            paginationCount={transactionPage?.totalCount ?? 0}
            editingScheduledRowId={editorMode?.kind === 'plannedRule' ? editorMode.row._id : undefined}
            renderInlineEditorCard={
              editorMode?.kind === 'create' && inlineEditor
                ? () => <InlineTransactionEditorCard controller={inlineEditor} />
                : undefined
            }
            renderInlineEditorRows={
              editorMode?.kind === 'create' && inlineEditor
                ? (editorColumns) => <InlineTransactionEditorRows columns={editorColumns} controller={inlineEditor} />
                : undefined
            }
            renderScheduledInlineEditorCard={
              editorMode?.kind === 'plannedRule' && inlineEditor
                ? () => <InlineTransactionEditorCard controller={inlineEditor} />
                : undefined
            }
            renderScheduledInlineEditorRows={
              editorMode?.kind === 'plannedRule' && inlineEditor
                ? (editorColumns) => <InlineTransactionEditorRows columns={editorColumns} controller={inlineEditor} />
                : undefined
            }
            scanCapped={transactionPage?.scanCapped ?? false}
            scanLimit={MAX_TRANSACTION_SCAN}
            scheduledRows={scheduledRows}
            sorting={sorting}
            scopeAccountId={scopeAccountId}
            tags={tags}
            totalCount={Math.max(0, (transactionPage?.totalCount ?? 0) - (scheduledPage?.totalCount ?? 0))}
          />
        </CardContent>
      </Card>

      <ManualTransactionDialog
        accounts={accountList}
        categories={categoryList}
        open={editingManualTransaction !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingManualTransaction(null);
          }
        }}
        transaction={editingManualTransaction}
      />
      <CounterpartTransferDialog
        accounts={accountList}
        categories={categoryList}
        open={counterpartTransaction !== null}
        onOpenChange={(open) => {
          if (!open) setCounterpartTransaction(null);
        }}
        transaction={counterpartTransaction}
      />
      <ManageTagsDialog open={manageTagsOpen} onOpenChange={setManageTagsOpen} tags={tags} />
      <MoneyBoxAssociationDialog
        open={moneyBoxTransaction !== null}
        transaction={moneyBoxTransaction}
        onOpenChange={(open) => {
          if (!open) setMoneyBoxTransaction(null);
        }}
      />

      <TransferCandidatesCard
        candidates={candidates}
        intlLocale={intlLocale}
        isPending={isPending}
        labels={{
          empty: t('transactions.transferCandidates.empty'),
          match: t('transactions.transferCandidates.match'),
          searching: t('transactions.transferCandidates.searching'),
          title: t('transactions.transferCandidates.title', { description: '{description}' }),
        }}
        onMatch={matchTransfer}
        selectedTransfer={selectedTransfer}
      />

      <InstallmentMatchDialog
        installments={installmentPlanPayments}
        intlLocale={intlLocale}
        labels={{
          aggregateAllocations: t('transactions.installmentDialog.aggregateAllocations'),
          aggregateEffect: t('transactions.installmentDialog.aggregateEffect'),
          aggregateMismatch: t('transactions.installmentDialog.aggregateMismatch', { amount: '{amount}' }),
          aggregateOption: t('transactions.installmentDialog.aggregateOption', {
            amount: '{amount}',
            count: '{count}',
            facility: '{facility}',
          }),
          cancel: t('planning.expenses.editCancel'),
          confirm: t('transactions.installmentDialog.confirm'),
          confirming: t('credit.installments.confirmingSuggestion'),
          dateWarningDescription: t('transactions.installmentDialog.dateWarningDescription', { days: '{days}' }),
          dateWarningTitle: t('transactions.installmentDialog.dateWarningTitle'),
          description: t('transactions.installmentDialog.description', { amount: '{amount}', date: '{date}' }),
          descriptionEmpty: t('transactions.installmentDialog.descriptionEmpty'),
          installment: t('transactions.installmentDialog.installment'),
          installmentEmpty: t('transactions.installmentDialog.installmentEmpty'),
          installmentLoading: t('transactions.installmentDialog.installmentLoading'),
          installmentOpen: t('transactions.installmentDialog.installmentOpen'),
          installmentRecorded: t('transactions.installmentDialog.installmentRecorded'),
          installmentUnavailable: t('transactions.installmentDialog.installmentUnavailable'),
          notScheduled: t('common.notScheduled'),
          openEffect: t('transactions.installmentDialog.openEffect'),
          plan: t('transactions.installmentDialog.plan'),
          planEmpty: t('transactions.installmentDialog.planEmpty'),
          planMeta: t('transactions.installmentDialog.planMeta', { amount: '{amount}', date: '{date}' }),
          recordedEffect: t('transactions.installmentDialog.recordedEffect'),
          selectedInstallment: t('transactions.installmentDialog.selectedInstallment'),
          selectedInstallmentMeta: t('transactions.installmentDialog.selectedInstallmentMeta', {
            amount: '{amount}',
            date: '{date}',
          }),
          selectInstallment: t('transactions.installmentDialog.selectInstallment'),
          selectPlan: t('transactions.installmentDialog.selectPlan'),
          title: t('transactions.installmentDialog.title'),
        }}
        onCancel={() => {
          setSelectedInstallmentTransaction(null);
          setSelectedInstallmentOptionKey('');
          setSelectedInstallmentDueDate('');
        }}
        onConfirm={confirmInstallmentMatch}
        onInstallmentChange={setSelectedInstallmentDueDate}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedInstallmentTransaction(null);
            setSelectedInstallmentOptionKey('');
            setSelectedInstallmentDueDate('');
          }
        }}
        onOptionChange={(optionKey) => {
          setSelectedInstallmentOptionKey(optionKey);
          setSelectedInstallmentDueDate('');
        }}
        open={selectedInstallmentTransaction !== null}
        options={installmentLinkOptions}
        pending={isPending('installment-match')}
        selectedInstallmentDueDate={selectedInstallmentDueDate}
        selectedOption={selectedInstallmentOption}
        selectedOptionKey={selectedInstallmentOptionKey}
        target={selectedInstallmentTransaction}
      />

      <ScheduledReconcileSheet
        onOpenChange={(open) => {
          if (!open) {
            setScheduledReconcileTransaction(null);
          }
        }}
        transaction={scheduledReconcileTransaction}
      />

      <TransactionDetailSheet
        accountsById={accountById}
        intlLocale={intlLocale}
        labels={detailLabels}
        onManageTags={() => setManageTagsOpen(true)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedDetailTransaction(null);
          }
        }}
        open={selectedDetailTransaction !== null}
        tags={tags}
        transaction={selectedDetailTransaction}
      />
    </div>
  );
}
