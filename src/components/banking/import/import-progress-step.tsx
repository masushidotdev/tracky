import { CheckCircle2Icon, CircleAlertIcon } from 'lucide-react';

import type { CsvImportProgress } from './csv-import-wizard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { useI18n } from '@/lib/i18n';

export function ImportProgressStep({ onReset, progress }: { onReset: () => void; progress: CsvImportProgress }) {
  const { t } = useI18n();
  const percent = progress.total === 0 ? 100 : Math.round((progress.processed / progress.total) * 100);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{progress.completed ? t('import.summary.title') : t('import.progress.title')}</CardTitle>
        <CardDescription>
          {progress.completed
            ? t('import.summary.description')
            : t('import.progress.description', { processed: progress.processed, total: progress.total })}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <Progress value={percent} aria-label={t('import.progress.aria', { percent })} />
        {progress.completed ? (
          <Alert variant={progress.error ? 'destructive' : 'default'}>
            {progress.error ? <CircleAlertIcon /> : <CheckCircle2Icon />}
            <AlertTitle>{progress.error ? t('import.summary.interrupted') : t('import.summary.complete')}</AlertTitle>
            <AlertDescription>
              {t('import.summary.counts', {
                imported: progress.imported,
                skipped: progress.skippedDuplicates,
                failed: progress.failed.length,
              })}
              {progress.error ? ` ${progress.error}` : ''}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            {t('import.progress.batch', { current: progress.completedBatches + 1, total: progress.totalBatches })}
          </div>
        )}
        {progress.failed.length ? (
          <ul className="flex max-h-40 list-disc flex-col gap-1 overflow-auto pl-5 text-sm text-destructive">
            {progress.failed.map((failure) => (
              <li key={`${failure.index}-${failure.reason}`}>
                {t('import.summary.rowFailed', { row: failure.index + 2, reason: failure.reason })}
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
      {progress.completed ? (
        <CardFooter className="justify-end">
          <Button type="button" onClick={onReset}>
            {t('import.summary.another')}
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}
