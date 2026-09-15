export function InstallmentSegments({
  paidInstallments,
  totalInstallments,
}: {
  paidInstallments: number;
  totalInstallments: number;
}) {
  const boundedTotal = Math.max(1, totalInstallments);
  const boundedPaid = Math.max(0, Math.min(paidInstallments, boundedTotal));

  return (
    <div
      aria-label={`${boundedPaid} of ${boundedTotal}`}
      aria-valuemax={boundedTotal}
      aria-valuemin={0}
      aria-valuenow={boundedPaid}
      className="grid h-9 gap-1"
      role="progressbar"
      style={{ gridTemplateColumns: `repeat(${boundedTotal}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: boundedTotal }).map((_, index) => (
        <span
          key={`installment-segment-${index}`}
          className={index < boundedPaid ? 'rounded-sm bg-chart-4' : 'rounded-sm border border-border bg-background'}
        />
      ))}
    </div>
  );
}
