export type OptimizerMoneyBox = {
  id: string;
  name: string;
  targetDate: string;
  currency: string;
  remainingMinor: bigint;
  monthlyRequiredMinor: bigint;
  fundingStatus: 'covered' | 'behind' | 'dueSoon' | 'onTrack';
};

export type MoneyBoxAllocation = OptimizerMoneyBox & { allocationMinor: bigint; shortfallMinor: bigint };

const statusRank: Record<OptimizerMoneyBox['fundingStatus'], number> = {
  behind: 0,
  dueSoon: 1,
  onTrack: 2,
  covered: 3,
};

export function optimizeMoneyBoxFunding(input: {
  moneyBoxes: ReadonlyArray<OptimizerMoneyBox>;
  currency: string;
  availableMinor: bigint;
  priorityNames?: ReadonlyArray<string>;
}) {
  if (input.availableMinor < 0n) throw new Error('Available amount cannot be negative');
  if (input.moneyBoxes.some((moneyBox) => moneyBox.currency !== input.currency)) {
    throw new Error('Money-box currencies must match the allocation currency');
  }
  const priority = new Map(
    (input.priorityNames ?? []).map((name, index) => [name.trim().toLocaleLowerCase(), index] as const),
  );
  const ordered = [...input.moneyBoxes].sort((left, right) => {
    const leftPriority = priority.get(left.name.trim().toLocaleLowerCase());
    const rightPriority = priority.get(right.name.trim().toLocaleLowerCase());
    if (leftPriority !== undefined || rightPriority !== undefined) {
      if (leftPriority === undefined) return 1;
      if (rightPriority === undefined) return -1;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    }
    return (
      statusRank[left.fundingStatus] - statusRank[right.fundingStatus] ||
      left.targetDate.localeCompare(right.targetDate) ||
      left.name.localeCompare(right.name) ||
      left.id.localeCompare(right.id)
    );
  });
  let available = input.availableMinor;
  const allocations: Array<MoneyBoxAllocation> = ordered.map((moneyBox) => {
    const required =
      moneyBox.monthlyRequiredMinor < moneyBox.remainingMinor
        ? moneyBox.monthlyRequiredMinor
        : moneyBox.remainingMinor;
    const cappedRequired = required > 0n ? required : 0n;
    const allocationMinor = available < cappedRequired ? available : cappedRequired;
    available -= allocationMinor;
    return {
      ...moneyBox,
      allocationMinor,
      shortfallMinor: cappedRequired - allocationMinor,
    };
  });
  return {
    allocations,
    unallocatedMinor: available,
    shortfallMinor: allocations.reduce((sum, row) => sum + row.shortfallMinor, 0n),
  };
}
