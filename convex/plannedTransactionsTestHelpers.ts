import type { Doc } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';

type NewDocument<TTableName extends 'plannedTransactions'> = Omit<Doc<TTableName>, '_id' | '_creationTime'>;
type TestDbCtx = Pick<MutationCtx, 'db'>;

type PlannedExpenseSeed = Omit<NewDocument<'plannedTransactions'>, 'kind'>;
type PlannedTransferSeed = Omit<
  NewDocument<'plannedTransactions'>,
  'dueDate' | 'kind' | 'direction' | 'status' | 'source'
> & {
  scheduledDate: string;
  status: 'planned' | 'completed' | 'cancelled';
};

export async function insertPlannedExpense(ctx: TestDbCtx, expense: PlannedExpenseSeed) {
  return await ctx.db.insert('plannedTransactions', {
    ...expense,
    kind: expense.direction === 'inflow' ? 'income' : 'expense',
  });
}

export async function insertPlannedTransfer(ctx: TestDbCtx, transfer: PlannedTransferSeed) {
  const { scheduledDate, status, ...fields } = transfer;
  return await ctx.db.insert('plannedTransactions', {
    ...fields,
    dueDate: scheduledDate,
    kind: 'transfer',
    direction: 'outflow',
    status: status === 'completed' ? 'paid' : status,
    source: 'manual',
  });
}
