import * as React from 'react';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';

import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import { Amount } from '@/components/app/amount';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Spinner } from '@/components/ui/spinner';
import { accountLabel } from '@/lib/accounts';
import { formatDateTime, formatIsoDate } from '@/lib/format';
import { formatMoney } from '@/lib/money';

type Transaction = Doc<'transactions'>;

type TransferSuggestion = {
  transferMatchId?: Id<'transferMatches'>;
  outgoing: Transaction;
  incoming: Transaction;
  amountDelta: Transaction['amount'];
  confidence: number;
};

type ReviewLabels = {
  account: string;
  amount: string;
  bookingDate: string;
  classification: string;
  compare: string;
  confirm: string;
  confirmMatch: string;
  counterparty: string;
  details: string;
  direction: string;
  empty: string;
  importedAt: string;
  incomingTransaction: string;
  outgoingTransaction: string;
  possibleSubscription: string;
  possibleTransfer: string;
  provider: string;
  providerEntryReference: string;
  providerTransactionId: string;
  referenceNumber: string;
  reject: string;
  remittance: string;
  savedCandidateBadge: string;
  status: string;
  subscriptionMeta: string;
  title: string;
  transactionDate: string;
  transferDates: string;
  transferMeta: string;
  valueDate: string;
};

type ReviewSectionProps = {
  accountById: Map<Id<'financialAccounts'>, Doc<'financialAccounts'>>;
  intlLocale: string;
  isPending: (key?: string) => boolean;
  labels: ReviewLabels;
  onConfirmTransfer: (suggestion: TransferSuggestion) => void;
  onDismissSubscription: (transaction: Transaction) => void;
  onDismissTransfer: (suggestion: TransferSuggestion) => void;
  onMarkSubscription: (transaction: Transaction) => void;
  subscriptionCandidates: Array<Transaction>;
  transferCandidates: Array<TransferSuggestion>;
};

function formatOptional(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return '-';
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(' | ') : '-';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value, (_key, nestedValue) =>
      typeof nestedValue === 'bigint' ? nestedValue.toString() : nestedValue,
    );
  }

  return String(value);
}

function TransactionDetailItem({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm">{formatOptional(value)}</dd>
    </div>
  );
}

function TransactionReviewCard({
  account,
  intlLocale,
  labels,
  title,
  transaction,
}: {
  account: Doc<'financialAccounts'> | null | undefined;
  intlLocale: string;
  labels: ReviewLabels;
  title: string;
  transaction: Transaction;
}) {
  const providerMetadataEntries = Object.entries(transaction.providerMetadata ?? {}).slice(0, 8);

  return (
    <div className="min-w-0 rounded-md bg-background p-3 ring-1 ring-border/60">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {transaction.direction === 'DBIT' ? (
              <ArrowUpRight className="text-destructive" />
            ) : (
              <ArrowDownLeft className="text-positive" />
            )}
            <span className="font-medium">{title}</span>
            <Badge variant="outline">{transaction.direction}</Badge>
            <Badge variant="secondary">{transaction.status}</Badge>
          </div>
          <p className="break-words text-sm text-muted-foreground">{transaction.description}</p>
        </div>
        <Amount
          variant="signed"
          direction={transaction.direction}
          money={transaction.amount}
          className="shrink-0 text-right text-base font-semibold"
          sensitive={false}
        />
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <TransactionDetailItem label={labels.account} value={accountLabel(account)} />
        <TransactionDetailItem label={labels.bookingDate} value={formatIsoDate(transaction.bookingDate, intlLocale)} />
        <TransactionDetailItem
          label={labels.valueDate}
          value={transaction.valueDate ? formatIsoDate(transaction.valueDate, intlLocale) : null}
        />
        <TransactionDetailItem
          label={labels.transactionDate}
          value={transaction.transactionDate ? formatIsoDate(transaction.transactionDate, intlLocale) : null}
        />
        <TransactionDetailItem label={labels.counterparty} value={transaction.counterpartyName} />
        <TransactionDetailItem label={labels.classification} value={transaction.classificationKind} />
      </dl>

      <Accordion type="single" collapsible className="mt-4 rounded-md">
        <AccordionItem value="details">
          <AccordionTrigger className="px-3 py-2">{labels.details}</AccordionTrigger>
          <AccordionContent className="px-3 pb-3">
            <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <TransactionDetailItem label={labels.provider} value={transaction.provider} />
              <TransactionDetailItem label={labels.status} value={transaction.status} />
              <TransactionDetailItem label={labels.direction} value={transaction.direction} />
              <TransactionDetailItem label={labels.amount} value={formatMoney(transaction.amount, intlLocale)} />
              <TransactionDetailItem label={labels.providerTransactionId} value={transaction.providerTransactionId} />
              <TransactionDetailItem label={labels.providerEntryReference} value={transaction.providerEntryReference} />
              <TransactionDetailItem label={labels.referenceNumber} value={transaction.referenceNumber} />
              <TransactionDetailItem label={labels.remittance} value={transaction.remittanceInformation} />
              <TransactionDetailItem
                label={labels.importedAt}
                value={formatDateTime(transaction.importedAtMs, intlLocale)}
              />
              {providerMetadataEntries.map(([key, value]) => (
                <TransactionDetailItem key={key} label={key} value={value} />
              ))}
            </dl>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

export function ReviewSection({
  accountById,
  intlLocale,
  isPending,
  labels,
  onConfirmTransfer,
  onDismissSubscription,
  onDismissTransfer,
  onMarkSubscription,
  subscriptionCandidates,
  transferCandidates,
}: ReviewSectionProps) {
  if (subscriptionCandidates.length === 0 && transferCandidates.length === 0) {
    return null;
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{labels.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-border/60">
          {subscriptionCandidates.map((transaction) => {
            const confirmKey = `subscription:${transaction._id}`;
            const rejectKey = `reject-subscription:${transaction._id}`;

            return (
              <div
                key={transaction._id}
                className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <div className="font-medium">
                    {labels.possibleSubscription.replace('{description}', transaction.description)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {labels.subscriptionMeta
                      .replace('{amount}', formatMoney(transaction.amount, intlLocale))
                      .replace('{confidence}', String(Math.round((transaction.classificationConfidence ?? 0) * 100)))
                      .replace('{date}', formatIsoDate(transaction.bookingDate, intlLocale))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" disabled={isPending()} onClick={() => onMarkSubscription(transaction)}>
                    {isPending(confirmKey) ? <Spinner data-icon="inline-start" /> : null}
                    {labels.confirm}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending()}
                    onClick={() => onDismissSubscription(transaction)}
                  >
                    {isPending(rejectKey) ? <Spinner data-icon="inline-start" /> : null}
                    {labels.reject}
                  </Button>
                </div>
              </div>
            );
          })}

          {transferCandidates.map((suggestion) => {
            const transferMatchId = suggestion.transferMatchId;
            const confirmKey = `confirm-transfer:${transferMatchId ?? `${suggestion.outgoing._id}:${suggestion.incoming._id}`}`;
            const rejectKey = `reject-transfer:${transferMatchId ?? `${suggestion.outgoing._id}:${suggestion.incoming._id}`}`;

            return (
              <div key={`${suggestion.outgoing._id}-${suggestion.incoming._id}`} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium">{labels.possibleTransfer}</div>
                      {transferMatchId ? <Badge variant="outline">{labels.savedCandidateBadge}</Badge> : null}
                    </div>
                    <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                      <span>
                        {labels.transferMeta
                          .replace('{amount}', formatMoney(suggestion.amountDelta, intlLocale))
                          .replace('{confidence}', String(Math.round(suggestion.confidence * 100)))}
                      </span>
                      <span>
                        {labels.transferDates
                          .replace('{incomingDate}', formatIsoDate(suggestion.incoming.bookingDate, intlLocale))
                          .replace('{outgoingDate}', formatIsoDate(suggestion.outgoing.bookingDate, intlLocale))}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" disabled={isPending()} onClick={() => onConfirmTransfer(suggestion)}>
                      {isPending(confirmKey) ? <Spinner data-icon="inline-start" /> : null}
                      {labels.confirmMatch}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending()}
                      onClick={() => onDismissTransfer(suggestion)}
                    >
                      {isPending(rejectKey) ? <Spinner data-icon="inline-start" /> : null}
                      {labels.reject}
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_auto_1fr] xl:items-start">
                  <TransactionReviewCard
                    account={accountById.get(suggestion.outgoing.accountId)}
                    intlLocale={intlLocale}
                    labels={labels}
                    title={labels.outgoingTransaction}
                    transaction={suggestion.outgoing}
                  />
                  <div className="hidden h-full items-center justify-center px-1 xl:flex">
                    <div className="rounded-full border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                      {labels.compare}
                    </div>
                  </div>
                  <TransactionReviewCard
                    account={accountById.get(suggestion.incoming.accountId)}
                    intlLocale={intlLocale}
                    labels={labels}
                    title={labels.incomingTransaction}
                    transaction={suggestion.incoming}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
