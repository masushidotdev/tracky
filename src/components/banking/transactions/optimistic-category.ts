import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import type { TransactionRow } from './columns';
import { categorySupportsKind } from '@/lib/categories';

export function optimisticallyAssignTransactionCategory(
  transaction: Omit<TransactionRow, 'account' | 'category'>,
  transactionId: Id<'transactions'>,
  categoryId: Id<'categories'> | undefined,
  category: Doc<'categories'> | null,
  updatedAtMs: number,
): Omit<TransactionRow, 'account' | 'category'> {
  const updateTarget = (target: Doc<'transactions'>) => {
    if (target._id !== transactionId) return target;

    const currentCategoryKind =
      target.classificationKind === 'income'
        ? ('income' as const)
        : target.classificationKind === 'transfer'
          ? ('transfer' as const)
          : target.classificationKind === 'expense' || target.classificationKind === 'subscription'
            ? ('expense' as const)
            : target.classificationKind === 'internal'
              ? ('internal' as const)
              : null;
    const classificationKind = category
      ? currentCategoryKind && categorySupportsKind(category, currentCategoryKind)
        ? target.classificationKind
        : category.kind === 'transfer'
          ? ('transfer' as const)
          : category.kind === 'income'
            ? ('income' as const)
            : target.classificationKind === 'subscription'
              ? ('subscription' as const)
              : ('expense' as const)
      : target.classificationKind === 'uncategorized' && target.direction === 'DBIT'
        ? ('expense' as const)
        : target.classificationKind;
    const classificationChanged = classificationKind !== target.classificationKind;
    return {
      ...target,
      categoryId,
      classificationKind,
      classificationSource: classificationChanged ? ('user' as const) : target.classificationSource,
      ...(classificationChanged ? { classificationConfidence: 1 } : {}),
      updatedAtMs,
    };
  };

  const updatedTransaction = updateTarget(transaction);
  const transferPresentation = transaction.transferPresentation;
  const outgoing = transferPresentation?.outgoing;
  if (!outgoing || outgoing._id !== transactionId) return updatedTransaction;
  return {
    ...updatedTransaction,
    transferPresentation: {
      ...transferPresentation,
      outgoing: updateTarget(outgoing),
    },
  };
}
