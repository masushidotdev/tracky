import * as React from 'react';
import { useMutation } from 'convex/react';

import { api } from '../../../../convex/_generated/api';
import { TagPicker } from './tag-picker';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import type { TransactionRow } from './columns';
import { Amount } from '@/components/app/amount';
import { DetailSheet } from '@/components/app/detail-sheet';
import { TagBadge } from '@/components/app/tag-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel, FieldTitle } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { usePendingAction } from '@/hooks/use-pending-action';
import { accountLabel } from '@/lib/accounts';
import { formatDateTime, formatIsoDate } from '@/lib/format';
import { formatMoney } from '@/lib/money';

type TransactionDetailSheetProps = {
  accountsById: Map<Id<'financialAccounts'>, Doc<'financialAccounts'>>;
  intlLocale: string;
  labels: {
    account: string;
    amount: string;
    bookingDate: string;
    classification: string;
    classificationSource: string;
    counterparty: string;
    date: string;
    description: string;
    destination: string;
    direction: string;
    feeDelta: string;
    hidden: string;
    hiddenDescription: string;
    hiddenUpdateFailed: string;
    hiddenUpdated: string;
    importedAt: string;
    metadataTitle: string;
    netTransfer: string;
    noTags: string;
    note: string;
    noteDescription: string;
    notePlaceholder: string;
    noteSaveFailed: string;
    noteSaved: string;
    provider: string;
    providerEntryReference: string;
    providerTransactionId: string;
    referenceNumber: string;
    remittance: string;
    saveNote: string;
    source: string;
    status: string;
    tags: string;
    tagsUpdateFailed: string;
    tagsUpdated: string;
    title: string;
    transactionDate: string;
    transferDetails: string;
    unknownDestination: string;
    unknownSource: string;
    valueDate: string;
  };
  onManageTags: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  tags: Array<Doc<'transactionTags'>> | undefined;
  transaction: TransactionRow | null;
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

function TransactionDetailItem({
  label,
  numeric = false,
  value,
}: {
  label: string;
  numeric?: boolean;
  value: unknown;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={numeric ? 'break-words text-sm tabular-nums' : 'break-words text-sm'}>{formatOptional(value)}</dd>
    </div>
  );
}

function accountLabelById(
  accountsById: Map<Id<'financialAccounts'>, Doc<'financialAccounts'>>,
  accountId: Id<'financialAccounts'>,
) {
  return accountLabel(accountsById.get(accountId));
}

function TransferSideDetails({
  account,
  intlLocale,
  labels,
  title,
  transaction,
}: {
  account: string;
  intlLocale: string;
  labels: TransactionDetailSheetProps['labels'];
  title: string;
  transaction: Doc<'transactions'> | undefined;
}) {
  if (!transaction) {
    return (
      <div className="rounded-md border bg-background p-3">
        <div className="text-sm font-medium">{title}</div>
        <div className="mt-2 text-sm text-muted-foreground">{account}</div>
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">{title}</div>
          <div className="truncate text-sm text-muted-foreground">{account}</div>
        </div>
        <Amount
          variant="signed"
          direction={transaction.direction}
          money={transaction.amount}
          className="text-sm font-medium"
          sensitive={false}
        />
      </div>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">{labels.description}</dt>
          <dd className="truncate">{transaction.description}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{labels.date}</dt>
          <dd>{formatIsoDate(transaction.bookingDate, intlLocale)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{labels.classificationSource}</dt>
          <dd>{transaction.classificationSource}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{labels.status}</dt>
          <dd>{transaction.status}</dd>
        </div>
      </dl>
    </div>
  );
}

export function TransactionDetailSheet({
  accountsById,
  intlLocale,
  labels,
  onManageTags,
  onOpenChange,
  open,
  tags,
  transaction,
}: TransactionDetailSheetProps) {
  const setTransactionTags = useMutation(api.banking.transactionMeta.setTransactionTags);
  const setTransactionHidden = useMutation(api.banking.transactionMeta.setTransactionHidden);
  const setTransactionNote = useMutation(api.banking.transactionMeta.setTransactionNote);
  const { isPending, run } = usePendingAction();
  const [tagIds, setTagIds] = React.useState<Array<Id<'transactionTags'>>>([]);
  const [hidden, setHidden] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [savedNote, setSavedNote] = React.useState('');

  React.useEffect(() => {
    setTagIds(transaction?.tagIds ?? []);
    setHidden(transaction?.hiddenFromReports === true);
    setNote(transaction?.note ?? '');
    setSavedNote(transaction?.note ?? '');
  }, [transaction?._id, transaction?.hiddenFromReports, transaction?.note, transaction?.tagIds]);

  const transfer = transaction?.transferPresentation;
  const providerMetadataEntries = Object.entries(transaction?.providerMetadata ?? {}).slice(0, 8);
  const tagsById = React.useMemo(() => new Map(tags?.map((tag) => [tag._id, tag]) ?? []), [tags]);
  const resolvedTagIds = tagIds.filter((tagId) => tagsById.has(tagId));
  const resolvedTags = resolvedTagIds.map((tagId) => tagsById.get(tagId)).filter((tag): tag is Doc<'transactionTags'> => Boolean(tag));

  const outgoingAccount =
    transfer?.sourceLabel ??
    (transfer?.outgoing ? accountLabelById(accountsById, transfer.outgoing.accountId) : null) ??
    labels.unknownSource;
  const incomingAccount =
    transfer?.destinationLabel ??
    (transfer?.incoming ? accountLabelById(accountsById, transfer.incoming.accountId) : null) ??
    labels.unknownDestination;

  const changeTags = async (nextTagIds: Array<Id<'transactionTags'>>) => {
    if (!transaction) return;
    const previousTagIds = tagIds;
    setTagIds(nextTagIds);
    const succeeded = await run(
      `transaction-tags:${transaction._id}`,
      async () => {
        await setTransactionTags({ transactionId: transaction._id, tagIds: nextTagIds });
      },
      { success: labels.tagsUpdated, error: labels.tagsUpdateFailed },
    );
    if (!succeeded) setTagIds(previousTagIds);
  };

  const changeHidden = async (nextHidden: boolean) => {
    if (!transaction) return;
    const previousHidden = hidden;
    setHidden(nextHidden);
    const succeeded = await run(
      `transaction-hidden:${transaction._id}`,
      async () => {
        await setTransactionHidden({ transactionId: transaction._id, hidden: nextHidden });
      },
      { success: labels.hiddenUpdated, error: labels.hiddenUpdateFailed },
    );
    if (!succeeded) setHidden(previousHidden);
  };

  const saveNote = async () => {
    if (!transaction || note === savedNote) return;
    const succeeded = await run(
      `transaction-note:${transaction._id}`,
      async () => {
        await setTransactionNote({ transactionId: transaction._id, note });
      },
      { success: labels.noteSaved, error: labels.noteSaveFailed },
    );
    if (succeeded) {
      const trimmedNote = note.trim();
      setNote(trimmedNote);
      setSavedNote(trimmedNote);
    }
  };

  return (
    <DetailSheet
      open={open}
      onOpenChange={onOpenChange}
      title={transaction?.description ?? labels.title}
      description={transaction?.counterpartyName ?? accountLabel(transaction?.account)}
    >
      {transaction ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={transaction.classificationKind === 'uncategorized' ? 'secondary' : 'default'}>
                {transaction.classificationKind}
              </Badge>
              <Badge variant="outline">{transaction.classificationSource}</Badge>
              <Badge variant="secondary">{transaction.status}</Badge>
            </div>
            <Amount
              variant="signed"
              direction={transaction.direction}
              money={transaction.amount}
              className="text-base font-semibold"
              sensitive={false}
            />
          </div>

          <section className="grid gap-4 rounded-md border bg-muted/20 p-4">
            <div>
              <h3 className="text-sm font-medium">{labels.metadataTitle}</h3>
            </div>
            <Field>
              <FieldLabel>{labels.tags}</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {resolvedTags.length > 0 ? (
                  resolvedTags.map((tag) => <TagBadge key={tag._id} tag={tag} />)
                ) : (
                  <span className="text-sm text-muted-foreground">{labels.noTags}</span>
                )}
              </div>
              <TagPicker
                tags={tags}
                selectedTagIds={resolvedTagIds}
                onChange={changeTags}
                onManage={onManageTags}
                disabled={isPending(`transaction-tags:${transaction._id}`)}
              />
            </Field>
            <Field orientation="horizontal">
              <div className="flex-1">
                <FieldTitle>{labels.hidden}</FieldTitle>
                <FieldDescription>{labels.hiddenDescription}</FieldDescription>
              </div>
              <Switch
                checked={hidden}
                disabled={isPending(`transaction-hidden:${transaction._id}`)}
                aria-label={labels.hidden}
                onCheckedChange={(checked) => void changeHidden(checked)}
              />
            </Field>
            <Field>
              <div className="flex items-center justify-between gap-3">
                <FieldLabel htmlFor="transaction-note">{labels.note}</FieldLabel>
                <span className="text-xs tabular-nums text-muted-foreground">{note.length}/500</span>
              </div>
              <Textarea
                id="transaction-note"
                maxLength={500}
                value={note}
                placeholder={labels.notePlaceholder}
                onBlur={() => void saveNote()}
                onChange={(event) => setNote(event.target.value)}
              />
              <FieldDescription>{labels.noteDescription}</FieldDescription>
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  disabled={note === savedNote || isPending(`transaction-note:${transaction._id}`)}
                  onClick={() => void saveNote()}
                >
                  {labels.saveNote}
                </Button>
              </div>
            </Field>
          </section>

          <dl className="grid gap-3 sm:grid-cols-2">
            <TransactionDetailItem label={labels.account} value={accountLabel(transaction.account)} />
            <TransactionDetailItem
              label={labels.bookingDate}
              value={formatIsoDate(transaction.bookingDate, intlLocale)}
            />
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
            <TransactionDetailItem label={labels.provider} value={transaction.provider} />
            <TransactionDetailItem label={labels.status} value={transaction.status} />
            <TransactionDetailItem label={labels.direction} value={transaction.direction} />
            <TransactionDetailItem label={labels.amount} numeric value={formatMoney(transaction.amount, intlLocale)} />
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

          {transfer ? (
            <div className="flex flex-col gap-3 rounded-md bg-muted/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {labels.transferDetails}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
                  <span>
                    {labels.netTransfer}: {formatMoney(transfer.neutralAmount, intlLocale)}
                  </span>
                  {transfer.amountDelta ? (
                    <span>
                      {labels.feeDelta}: {formatMoney(transfer.amountDelta, intlLocale)}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="grid gap-3">
                <TransferSideDetails
                  account={outgoingAccount}
                  intlLocale={intlLocale}
                  labels={labels}
                  title={labels.source}
                  transaction={transfer.outgoing}
                />
                <TransferSideDetails
                  account={incomingAccount}
                  intlLocale={intlLocale}
                  labels={labels}
                  title={labels.destination}
                  transaction={transfer.incoming}
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </DetailSheet>
  );
}
