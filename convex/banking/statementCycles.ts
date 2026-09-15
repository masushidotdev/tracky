export type StatementCycleFacility = {
  paymentDayOfMonth?: number;
  statementDayOfMonth?: number;
};

export function isoDateForMonthDay(monthKey: string, day: number) {
  const [year, month] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const boundedDay = Math.min(Math.max(day, 1), daysInMonth);
  return `${monthKey}-${String(boundedDay).padStart(2, '0')}`;
}

export function addMonthsToCycleMonth(monthKey: string, months: number) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function defaultUsageCycleDueDate(facility: StatementCycleFacility, cycleMonth: string) {
  return isoDateForMonthDay(addMonthsToCycleMonth(cycleMonth, 1), facility.paymentDayOfMonth ?? 1);
}

export function usageCycleCloseBoundary(facility: StatementCycleFacility, cycleMonth: string) {
  if (facility.statementDayOfMonth !== undefined) {
    return isoDateForMonthDay(cycleMonth, facility.statementDayOfMonth);
  }

  const [year, month] = cycleMonth.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return isoDateForMonthDay(cycleMonth, lastDay);
}

export function unscheduledCardUsageMinor(usedAmountMinor: bigint, scheduledAmountMinor: bigint) {
  const remaining = usedAmountMinor - scheduledAmountMinor;
  return remaining > 0n ? remaining : 0n;
}
