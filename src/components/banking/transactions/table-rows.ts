export function transactionPageRowsForTable<T extends { status: string }>(
  rows: ReadonlyArray<T>,
  filteredStatus: string | undefined,
) {
  return filteredStatus ? [...rows] : rows.filter((transaction) => transaction.status !== 'SCHD');
}
