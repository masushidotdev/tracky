import * as React from 'react';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { FilePlus2Icon } from 'lucide-react';
import { toast } from 'sonner';

import { api } from '../../../../convex/_generated/api';
import { ColumnMappingStep } from './column-mapping-step';
import { ImportProgressStep } from './import-progress-step';
import { PreviewStep } from './preview-step';
import { UploadStep } from './upload-step';
import type { Id } from '../../../../convex/_generated/dataModel';
import type { CsvColumnMapping, CsvParseResult, ParsedCsvTransaction } from '@/lib/csv/parse';
import { computeDedupeKey, parseTransactionRow } from '@/lib/csv/parse';
import { ManualAccountDialog } from '@/components/banking/accounts/manual-account-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { analyticsEvents, countBucket, trackEvent } from '@/lib/analytics/events';
import { useI18n } from '@/lib/i18n';

type ImportTransaction = ParsedCsvTransaction & {
  categoryId?: Id<'categories'>;
  dedupeKey: string;
};

export type CsvPreviewRow = {
  sourceIndex: number;
  status: 'valid' | 'duplicate' | 'error';
  reason?: string;
  transaction?: ImportTransaction;
};

export type CsvImportProgress = {
  completed: boolean;
  completedBatches: number;
  error?: string;
  failed: Array<{ index: number; reason: string }>;
  imported: number;
  processed: number;
  skippedDuplicates: number;
  total: number;
  totalBatches: number;
};

type MappingSelection = {
  accountId: Id<'financialAccounts'>;
  categoryId?: Id<'categories'>;
  mapping: CsvColumnMapping;
};

const BATCH_SIZE = 100;
const DEDUPE_CHECK_SIZE = 500;
const stepLabelKeys = {
  upload: 'import.step.upload',
  mapping: 'import.step.mapping',
  preview: 'import.step.preview',
  import: 'import.step.import',
} as const;

function chunks<T>(values: Array<T>, size: number) {
  const result: Array<Array<T>> = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export function CsvImportWizard() {
  const { t } = useI18n();
  const convex = useConvex();
  const importBatch = useMutation(api.banking.csvImport.importManualTransactionsBatch);
  const accounts = useQuery(api.banking.accounts.listAccounts, { status: 'active', limit: 200 });
  const categories = useQuery(api.banking.categories.listCategories, { limit: 200 });
  const manualAccounts = React.useMemo(
    () => (accounts ?? []).filter((account) => account.provider === 'manual'),
    [accounts],
  );
  const [step, setStep] = React.useState<'upload' | 'mapping' | 'preview' | 'import'>('upload');
  const [fileName, setFileName] = React.useState('');
  const [parsed, setParsed] = React.useState<CsvParseResult | null>(null);
  const [selection, setSelection] = React.useState<MappingSelection | null>(null);
  const [previewRows, setPreviewRows] = React.useState<Array<CsvPreviewRow>>([]);
  const [isPreparing, setIsPreparing] = React.useState(false);
  const [manualDialogOpen, setManualDialogOpen] = React.useState(false);
  const [progress, setProgress] = React.useState<CsvImportProgress | null>(null);

  const stepOrder = ['upload', 'mapping', 'preview', 'import'] as const;
  const activeStepIndex = stepOrder.indexOf(step);

  function reset() {
    setStep('upload');
    setFileName('');
    setParsed(null);
    setSelection(null);
    setPreviewRows([]);
    setProgress(null);
  }

  async function preparePreview(nextSelection: MappingSelection) {
    if (!parsed) return;
    setIsPreparing(true);
    try {
      const parserErrorsByRow = new Map<number, Array<string>>();
      for (const parserError of parsed.errors) {
        if (parserError.row === undefined) continue;
        parserErrorsByRow.set(parserError.row, [
          ...(parserErrorsByRow.get(parserError.row) ?? []),
          parserError.message,
        ]);
      }
      const prepared = await Promise.all(
        parsed.rows.map(async (sourceRow, sourceIndex): Promise<CsvPreviewRow> => {
          try {
            const parserErrors = parserErrorsByRow.get(sourceIndex);
            if (parserErrors?.length) {
              throw new Error(parserErrors.join('; '));
            }
            const account = manualAccounts.find((candidate) => candidate._id === nextSelection.accountId);
            if (!account) throw new Error(t('import.mapping.accountMissing'));
            const base = parseTransactionRow(sourceRow, nextSelection.mapping, account.currency);
            const dedupeKey = await computeDedupeKey({
              bookingDate: base.bookingDate,
              direction: base.direction,
              amountMinor: base.amount.amountMinor,
              currency: base.amount.currency,
              description: base.description,
            });
            return {
              sourceIndex,
              status: 'valid',
              transaction: { ...base, categoryId: nextSelection.categoryId, dedupeKey },
            };
          } catch (error) {
            return {
              sourceIndex,
              status: 'error',
              reason: error instanceof Error ? error.message : t('import.preview.invalid'),
            };
          }
        }),
      );

      const locallySeen = new Set<string>();
      for (const row of prepared) {
        const key = row.transaction?.dedupeKey;
        if (!key) continue;
        if (locallySeen.has(key)) {
          row.status = 'duplicate';
          row.reason = t('import.preview.duplicateInFile');
        } else {
          locallySeen.add(key);
        }
      }

      const uniqueValidKeys = [
        ...new Set(
          prepared
            .filter((row) => row.status === 'valid')
            .map((row) => row.transaction?.dedupeKey)
            .filter((key): key is string => Boolean(key)),
        ),
      ];
      const existingChunks = await Promise.all(
        chunks(uniqueValidKeys, DEDUPE_CHECK_SIZE).map((dedupeKeys) =>
          convex.query(api.banking.csvImport.findExistingDedupeKeys, {
            accountId: nextSelection.accountId,
            dedupeKeys,
          }),
        ),
      );
      const existingKeys = new Set(existingChunks.flat());
      for (const row of prepared) {
        if (row.status === 'valid' && row.transaction && existingKeys.has(row.transaction.dedupeKey)) {
          row.status = 'duplicate';
          row.reason = t('import.preview.alreadyImported');
        }
      }

      setSelection(nextSelection);
      setPreviewRows(prepared);
      setStep('preview');
    } catch {
      toast.error(t('common.actionFailed'));
    } finally {
      setIsPreparing(false);
    }
  }

  async function startImport() {
    if (!selection) return;
    const eligible = previewRows.filter(
      (row): row is CsvPreviewRow & { transaction: ImportTransaction } =>
        row.status === 'valid' && Boolean(row.transaction),
    );
    // Row-count bucket only — never file names or row contents.
    trackEvent(analyticsEvents.csvImportStarted, { row_count_bucket: countBucket(eligible.length) });
    const batches = chunks(eligible, BATCH_SIZE);
    setProgress({
      completed: false,
      completedBatches: 0,
      failed: [],
      imported: 0,
      processed: 0,
      skippedDuplicates: 0,
      total: eligible.length,
      totalBatches: batches.length,
    });
    setStep('import');

    try {
      for (const batch of batches) {
        const result = await importBatch({
          accountId: selection.accountId,
          rows: batch.map(({ transaction }) => transaction),
        });
        const failures = result.failed.map((failure) => ({
          index: batch[failure.index]?.sourceIndex ?? failure.index,
          reason: failure.reason,
        }));
        setProgress((current) =>
          current
            ? {
                ...current,
                completedBatches: current.completedBatches + 1,
                failed: [...current.failed, ...failures],
                imported: current.imported + result.imported,
                processed: current.processed + batch.length,
                skippedDuplicates: current.skippedDuplicates + result.skippedDuplicates,
              }
            : current,
        );
      }
      setProgress((current) => (current ? { ...current, completed: true } : current));
      trackEvent(analyticsEvents.csvImportCompleted, { row_count_bucket: countBucket(eligible.length) });
    } catch (error) {
      setProgress((current) =>
        current
          ? {
              ...current,
              completed: true,
              error: error instanceof Error ? error.message : t('import.summary.failed'),
            }
          : current,
      );
      trackEvent(analyticsEvents.csvImportFailed, { error_step: 'import', surface: 'import' });
    }
  }

  const selectedAccount = selection ? manualAccounts.find((account) => account._id === selection.accountId) : undefined;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2" aria-label={t('import.steps')}>
        {stepOrder.map((stepName, index) => (
          <Badge
            key={stepName}
            variant={index === activeStepIndex ? 'default' : index < activeStepIndex ? 'secondary' : 'outline'}
          >
            {index + 1}. {t(stepLabelKeys[stepName])}
          </Badge>
        ))}
        {fileName ? <span className="ml-auto max-w-64 truncate text-sm text-muted-foreground">{fileName}</span> : null}
      </div>

      {step === 'upload' ? (
        <UploadStep
          onUploaded={(name, result) => {
            setFileName(name);
            setParsed(result);
            setStep('mapping');
          }}
        />
      ) : null}

      {step === 'mapping' && accounts === undefined ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-16">
            <Spinner />
            {t('common.loading')}
          </CardContent>
        </Card>
      ) : null}

      {step === 'mapping' && accounts !== undefined && manualAccounts.length === 0 ? (
        <Card>
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FilePlus2Icon />
                </EmptyMedia>
                <EmptyTitle>{t('import.noAccounts.title')}</EmptyTitle>
                <EmptyDescription>{t('import.noAccounts.description')}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button type="button" onClick={() => setManualDialogOpen(true)}>
                  {t('import.noAccounts.create')}
                </Button>
              </EmptyContent>
            </Empty>
          </CardContent>
        </Card>
      ) : null}

      {step === 'mapping' && parsed && manualAccounts.length > 0 ? (
        <ColumnMappingStep
          key={fileName}
          accounts={manualAccounts}
          categories={categories ?? []}
          headers={parsed.headers}
          isPreparing={isPreparing}
          onBack={reset}
          onContinue={(value) => void preparePreview(value)}
        />
      ) : null}

      {step === 'preview' && selection ? (
        <PreviewStep
          accountName={selectedAccount?.alias || selectedAccount?.name || t('import.mapping.accountMissing')}
          rows={previewRows}
          onBack={() => setStep('mapping')}
          onImport={() => void startImport()}
        />
      ) : null}

      {step === 'import' && progress ? <ImportProgressStep progress={progress} onReset={reset} /> : null}

      <ManualAccountDialog open={manualDialogOpen} onOpenChange={setManualDialogOpen} />
    </div>
  );
}
