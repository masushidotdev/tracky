import { ArrowLeftIcon, DatabaseIcon } from 'lucide-react';

import type { CsvPreviewRow } from './csv-import-wizard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatMoney } from '@/lib/money';
import { useI18n } from '@/lib/i18n';

export function PreviewStep({
  accountName,
  onBack,
  onImport,
  rows,
}: {
  accountName: string;
  onBack: () => void;
  onImport: () => void;
  rows: Array<CsvPreviewRow>;
}) {
  const { intlLocale, t } = useI18n();
  const validCount = rows.filter((row) => row.status === 'valid').length;
  const duplicateCount = rows.filter((row) => row.status === 'duplicate').length;
  const errorCount = rows.filter((row) => row.status === 'error').length;
  const visibleRows = rows.slice(0, 200);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('import.preview.title')}</CardTitle>
        <CardDescription>{t('import.preview.description', { account: accountName })}</CardDescription>
        <div className="flex flex-wrap gap-2 pt-2">
          <Badge variant="outline">{t('import.preview.validCount', { count: validCount })}</Badge>
          <Badge variant="secondary">{t('import.preview.duplicateCount', { count: duplicateCount })}</Badge>
          {errorCount ? (
            <Badge variant="destructive">{t('import.preview.errorCount', { count: errorCount })}</Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-[32rem] overflow-auto rounded-2xl ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('import.preview.status')}</TableHead>
                <TableHead>{t('import.preview.date')}</TableHead>
                <TableHead>{t('import.preview.descriptionColumn')}</TableHead>
                <TableHead className="text-right">{t('import.preview.amount')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((preview) => (
                <TableRow key={preview.sourceIndex}>
                  <TableCell>
                    {preview.status === 'valid' ? <Badge variant="outline">{t('import.preview.valid')}</Badge> : null}
                    {preview.status === 'duplicate' ? (
                      <Badge variant="secondary">{t('import.preview.duplicate')}</Badge>
                    ) : null}
                    {preview.status === 'error' ? (
                      <Badge variant="destructive">{t('import.preview.error')}</Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>{preview.transaction?.bookingDate ?? '—'}</TableCell>
                  <TableCell>
                    <div className="max-w-md">
                      <div className="truncate">
                        {preview.transaction?.description ??
                          t('import.preview.invalidRow', { row: preview.sourceIndex + 2 })}
                      </div>
                      {preview.reason ? (
                        <div className="truncate text-xs text-muted-foreground">{preview.reason}</div>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {preview.transaction
                      ? `${preview.transaction.direction === 'DBIT' ? '−' : '+'}${formatMoney(preview.transaction.amount, intlLocale)}`
                      : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {rows.length > visibleRows.length ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {t('import.preview.firstRows', { count: visibleRows.length })}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="justify-between gap-2">
        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeftIcon data-icon="inline-start" />
          {t('import.back')}
        </Button>
        <Button type="button" disabled={validCount === 0} onClick={onImport}>
          <DatabaseIcon data-icon="inline-start" />
          {t('import.preview.import', { count: validCount })}
        </Button>
      </CardFooter>
    </Card>
  );
}
