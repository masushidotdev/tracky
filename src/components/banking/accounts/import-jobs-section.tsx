import * as React from 'react';
import { ChevronDownIcon, HistoryIcon } from 'lucide-react';
import { useQuery } from 'convex/react';

import { api } from '../../../../convex/_generated/api';
import { ImportJobsCard } from './import-jobs-card';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useI18n } from '@/lib/i18n';

export function ImportJobsSection() {
  const { intlLocale, t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const importJobs = useQuery(api.banking.accounts.listImportJobs, open ? { limit: 12 } : 'skip');
  const title = t('accounts.importJobs.title');

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card size="sm">
        <CardHeader className="p-0">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex items-center gap-2 font-heading text-base font-medium">
                <HistoryIcon />
                {title}
              </span>
              <ChevronDownIcon
                className={open ? 'size-4 rotate-180 transition-transform' : 'size-4 transition-transform'}
              />
            </button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          <CardContent>
            <ImportJobsCard
              importJobs={importJobs}
              intlLocale={intlLocale}
              labels={{
                balances: t('accounts.importJobs.balances', { imported: '{imported}', seen: '{seen}' }),
                completed: t('accounts.importJobs.completed', { date: '{date}' }),
                empty: t('accounts.importJobs.empty'),
                pages: t('accounts.importJobs.pages', { count: '{count}' }),
                retryAt: t('accounts.importJobs.retryAt', { date: '{date}' }),
                started: t('accounts.importJobs.started', { date: '{date}' }),
                targetUnknown: t('accounts.importJobs.targetUnknown'),
                transactions: t('accounts.importJobs.transactions', { imported: '{imported}', seen: '{seen}' }),
              }}
              t={t}
            />
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
