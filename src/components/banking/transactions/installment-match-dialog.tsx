import { TriangleAlertIcon } from 'lucide-react';

import type { FunctionReturnType } from 'convex/server';
import type { api } from '../../../../convex/_generated/api';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { formatIsoDate } from '@/lib/format';
import { useBalancePrivacy } from '@/lib/balance-privacy-context';
import { formatMoney } from '@/lib/money';

export type InstallmentLinkOption = FunctionReturnType<typeof api.banking.credit.listInstallmentLinkOptions>[number];

type InstallmentPayment = {
  scheduledDueDate: string;
  amount: {
    amountMinor: bigint;
    currency: string;
  };
  paymentDate: string | null;
  isLinked: boolean;
  transactionId: Id<'transactions'> | null;
  isRecorded: boolean;
};

type InstallmentMatchDialogProps = {
  installments: Array<InstallmentPayment> | undefined;
  intlLocale: string;
  labels: {
    aggregateAllocations: string;
    aggregateEffect: string;
    aggregateMismatch: string;
    aggregateOption: string;
    cancel: string;
    confirm: string;
    confirming: string;
    dateWarningDescription: string;
    dateWarningTitle: string;
    description: string;
    descriptionEmpty: string;
    installment: string;
    installmentEmpty: string;
    installmentLoading: string;
    installmentOpen: string;
    installmentRecorded: string;
    installmentUnavailable: string;
    openEffect: string;
    plan: string;
    planEmpty: string;
    planMeta: string;
    recordedEffect: string;
    selectedInstallment: string;
    selectedInstallmentMeta: string;
    selectInstallment: string;
    selectPlan: string;
    title: string;
    notScheduled: string;
  };
  onCancel: () => void;
  onConfirm: () => void;
  onInstallmentChange: (scheduledDueDate: string) => void;
  onOpenChange: (open: boolean) => void;
  onOptionChange: (optionKey: string) => void;
  open: boolean;
  options: Array<InstallmentLinkOption> | undefined;
  pending: boolean;
  selectedInstallmentDueDate: string;
  selectedOption: InstallmentLinkOption | null;
  selectedOptionKey: string;
  target: Doc<'transactions'> | null;
};

function isoDateDistanceDays(left: string, right: string) {
  const leftMs = new Date(`${left}T00:00:00.000Z`).getTime();
  const rightMs = new Date(`${right}T00:00:00.000Z`).getTime();
  return Math.abs(Math.round((leftMs - rightMs) / (24 * 60 * 60 * 1000)));
}

export function InstallmentMatchDialog({
  installments,
  intlLocale,
  labels,
  onCancel,
  onConfirm,
  onInstallmentChange,
  onOpenChange,
  onOptionChange,
  open,
  options,
  pending,
  selectedInstallmentDueDate,
  selectedOption,
  selectedOptionKey,
  target,
}: InstallmentMatchDialogProps) {
  const { maskValue } = useBalancePrivacy();
  const selectedInstallment = installments?.find(
    (installment) => installment.scheduledDueDate === selectedInstallmentDueDate,
  );
  const selectedUnavailable = Boolean(
    selectedInstallment?.isLinked && selectedInstallment.transactionId !== target?._id,
  );
  const singleOption = selectedOption?.kind === 'single' ? selectedOption : null;
  const aggregateOption = selectedOption?.kind === 'aggregate' ? selectedOption : null;
  // The batch mutation books the transaction across the plans, so it demands the
  // allocations add up to it exactly. Say so here rather than let it be refused.
  const aggregateMismatch = Boolean(
    aggregateOption && target && aggregateOption.expectedAmount.amountMinor !== target.amount.amountMinor,
  );
  const dateDeltaDays =
    selectedInstallment && target ? isoDateDistanceDays(selectedInstallment.scheduledDueDate, target.bookingDate) : 0;
  const confirmDisabled = aggregateOption
    ? aggregateMismatch || pending
    : !selectedOptionKey || !selectedInstallmentDueDate || selectedUnavailable || pending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription>
            {target
              ? labels.description
                  .replace('{amount}', formatMoney(target.amount, intlLocale))
                  .replace('{date}', formatIsoDate(target.bookingDate, intlLocale))
              : labels.descriptionEmpty}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>{labels.plan}</FieldLabel>
            <Select
              value={selectedOptionKey}
              onValueChange={onOptionChange}
              disabled={options !== undefined && options.length === 0}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={labels.selectPlan} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {options?.map((option) => (
                    <SelectItem key={option.key} value={option.key}>
                      {option.kind === 'aggregate'
                        ? labels.aggregateOption
                            .replace('{facility}', option.facility.name)
                            .replace('{count}', String(option.allocations.length))
                            .replace('{amount}', maskValue(formatMoney(option.expectedAmount, intlLocale)))
                        : `${option.plan.name} - ${option.facility.name} - ${maskValue(
                            formatMoney(option.plan.monthlyPaymentAmount, intlLocale),
                          )}`}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {options !== undefined && options.length === 0 ? (
              <div className="text-sm text-muted-foreground">{labels.planEmpty}</div>
            ) : null}
          </Field>
          {singleOption ? (
            <div className="rounded-md border p-3 text-sm">
              <div className="font-medium">{singleOption.plan.name}</div>
              <div className="text-muted-foreground">
                {labels.planMeta
                  .replace('{amount}', maskValue(formatMoney(singleOption.plan.monthlyPaymentAmount, intlLocale)))
                  .replace(
                    '{date}',
                    singleOption.plan.nextPaymentDate
                      ? formatIsoDate(singleOption.plan.nextPaymentDate, intlLocale)
                      : labels.notScheduled,
                  )}
              </div>
            </div>
          ) : null}
          {aggregateOption ? (
            <div className="rounded-md border p-3 text-sm">
              <div className="font-medium">{labels.aggregateAllocations}</div>
              <ul className="mt-2 space-y-1">
                {aggregateOption.allocations.map((allocation) => (
                  <li key={allocation.plan._id} className="flex justify-between gap-3 text-muted-foreground">
                    <span>
                      {allocation.plan.name} · {formatIsoDate(allocation.scheduledDueDate, intlLocale)}
                    </span>
                    <span>{maskValue(formatMoney(allocation.expectedAmount, intlLocale))}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2">{labels.aggregateEffect}</div>
            </div>
          ) : null}
          {singleOption ? (
            <Field>
              <FieldLabel>{labels.installment}</FieldLabel>
              <Select
                value={selectedInstallmentDueDate}
                onValueChange={onInstallmentChange}
                disabled={installments === undefined || installments.length === 0}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={labels.selectInstallment} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {installments?.map((installment) => {
                      const unavailable = installment.isLinked && installment.transactionId !== target?._id;
                      const status = unavailable
                        ? labels.installmentUnavailable
                        : installment.isRecorded
                          ? labels.installmentRecorded
                          : labels.installmentOpen;
                      return (
                        <SelectItem
                          key={installment.scheduledDueDate}
                          value={installment.scheduledDueDate}
                          disabled={unavailable}
                        >
                          {formatIsoDate(installment.scheduledDueDate, intlLocale)} ·{' '}
                          {maskValue(formatMoney(installment.amount, intlLocale))} · {status}
                        </SelectItem>
                      );
                    })}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {installments === undefined ? (
                <div className="text-sm text-muted-foreground">{labels.installmentLoading}</div>
              ) : installments.length === 0 ? (
                <div className="text-sm text-muted-foreground">{labels.installmentEmpty}</div>
              ) : null}
            </Field>
          ) : null}
          {singleOption && selectedInstallment ? (
            <div className="rounded-md border p-3 text-sm">
              <div className="font-medium">{labels.selectedInstallment}</div>
              <div className="text-muted-foreground">
                {labels.selectedInstallmentMeta
                  .replace('{amount}', maskValue(formatMoney(selectedInstallment.amount, intlLocale)))
                  .replace('{date}', formatIsoDate(selectedInstallment.scheduledDueDate, intlLocale))}
              </div>
              <div className="mt-2">{selectedInstallment.isRecorded ? labels.recordedEffect : labels.openEffect}</div>
            </div>
          ) : null}
          {aggregateMismatch && aggregateOption ? (
            <Alert>
              <TriangleAlertIcon />
              <AlertTitle>{labels.dateWarningTitle}</AlertTitle>
              <AlertDescription>
                {labels.aggregateMismatch.replace(
                  '{amount}',
                  maskValue(formatMoney(aggregateOption.expectedAmount, intlLocale)),
                )}
              </AlertDescription>
            </Alert>
          ) : null}
          {singleOption && dateDeltaDays > 15 ? (
            <Alert>
              <TriangleAlertIcon />
              <AlertTitle>{labels.dateWarningTitle}</AlertTitle>
              <AlertDescription>
                {labels.dateWarningDescription.replace('{days}', String(dateDeltaDays))}
              </AlertDescription>
            </Alert>
          ) : null}
        </FieldGroup>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {labels.cancel}
          </Button>
          <Button type="button" disabled={confirmDisabled} onClick={onConfirm}>
            {pending ? <Spinner data-icon="inline-start" /> : null}
            {pending ? labels.confirming : labels.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
