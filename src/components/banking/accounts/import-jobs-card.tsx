import { HistoryIcon } from 'lucide-react';

import type { Doc } from '../../../../convex/_generated/dataModel';
import type { TranslationKey } from '@/lib/i18n';
import { EmptyState } from '@/components/app/empty-state';
import { ListSkeleton } from '@/components/app/skeletons';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/format';

export type ImportJobRow = {
  account: Pick<Doc<'financialAccounts'>, 'name'> | null;
  connection: { displayName: string } | null;
  job: {
    _id: string;
    balancesImported?: number;
    balancesSeen?: number;
    completedAtMs?: number;
    createdAtMs: number;
    errorCode?: string;
    errorMessage?: string;
    kind: string;
    nextRetryAtMs?: number;
    startedAtMs?: number;
    status: string;
    transactionsImported?: number;
    transactionsSeen?: number;
    transactionPagesFetched?: number;
    trigger?: string;
  };
};

type ImportJobsCardProps = {
  importJobs: Array<ImportJobRow> | undefined;
  intlLocale: string;
  labels: {
    balances: string;
    completed: string;
    empty: string;
    pages: string;
    retryAt: string;
    started: string;
    targetUnknown: string;
    transactions: string;
  };
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
};

export function ImportJobsCard({ importJobs, intlLocale, labels, t }: ImportJobsCardProps) {
  return (
    <>
      {importJobs === undefined ? <ListSkeleton rows={3} /> : null}
      {importJobs?.length === 0 ? <EmptyState icon={HistoryIcon} title={labels.empty} /> : null}
      {importJobs && importJobs.length > 0 ? (
        <div className="divide-y divide-border/60">
          {importJobs.map(({ account, connection, job }) => {
            const statusKey = `accounts.importJobs.status.${job.status}` as TranslationKey;
            const kindKey = `accounts.importJobs.kind.${job.kind}` as TranslationKey;
            const triggerKey = job.trigger ? (`accounts.importJobs.trigger.${job.trigger}` as TranslationKey) : null;
            const statusVariant =
              job.status === 'failed' ? 'destructive' : job.status === 'succeeded' ? 'default' : 'secondary';

            return (
              <div key={job._id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={statusVariant}>{t(statusKey)}</Badge>
                      <span className="font-medium">{t(kindKey)}</span>
                      {triggerKey ? <Badge variant="outline">{t(triggerKey)}</Badge> : null}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {account?.name ?? connection?.displayName ?? labels.targetUnknown}
                      {connection && account ? ` - ${connection.displayName}` : ''}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground md:text-right">
                    <div>
                      {labels.started.replace('{date}', formatDateTime(job.startedAtMs ?? job.createdAtMs, intlLocale))}
                    </div>
                    {job.completedAtMs ? (
                      <div>{labels.completed.replace('{date}', formatDateTime(job.completedAtMs, intlLocale))}</div>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-sm text-muted-foreground md:grid-cols-3">
                  <div>
                    {labels.balances
                      .replace('{imported}', String(job.balancesImported ?? 0))
                      .replace('{seen}', String(job.balancesSeen ?? 0))}
                  </div>
                  <div>
                    {labels.transactions
                      .replace('{imported}', String(job.transactionsImported ?? 0))
                      .replace('{seen}', String(job.transactionsSeen ?? 0))}
                  </div>
                  <div>{labels.pages.replace('{count}', String(job.transactionPagesFetched ?? 0))}</div>
                </div>
                {job.nextRetryAtMs ? (
                  <div className="mt-2 text-sm text-warning">
                    {labels.retryAt.replace('{date}', formatDateTime(job.nextRetryAtMs, intlLocale))}
                  </div>
                ) : null}
                {job.errorMessage ? (
                  <div className="mt-2 text-sm text-destructive">
                    {job.errorCode ? `${job.errorCode}: ${job.errorMessage}` : job.errorMessage}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
