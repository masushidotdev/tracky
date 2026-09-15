import * as React from 'react';
import { FileSpreadsheetIcon, UploadIcon } from 'lucide-react';

import type { CsvParseResult } from '@/lib/csv/parse';
import { parseCsv } from '@/lib/csv/parse';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useI18n } from '@/lib/i18n';

export function UploadStep({ onUploaded }: { onUploaded: (fileName: string, parsed: CsvParseResult) => void }) {
  const { t } = useI18n();
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isReading, setIsReading] = React.useState(false);

  async function continueToMapping() {
    if (!file) return;
    setIsReading(true);
    setError(null);
    try {
      const parsed = parseCsv(await file.text());
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        throw new Error(t('import.upload.empty'));
      }
      onUploaded(file.name, parsed);
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : t('import.upload.failed'));
    } finally {
      setIsReading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('import.upload.title')}</CardTitle>
        <CardDescription>{t('import.upload.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="csvFile">{t('import.upload.fileLabel')}</FieldLabel>
            <Input
              id="csvFile"
              type="file"
              accept=".csv,text/csv,application/vnd.ms-excel"
              aria-invalid={Boolean(error)}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setError(null);
              }}
            />
            <FieldDescription>{t('import.upload.privacy')}</FieldDescription>
            {error ? <FieldError>{error}</FieldError> : null}
          </Field>
        </FieldGroup>
        {file ? (
          <Alert className="mt-6">
            <FileSpreadsheetIcon />
            <AlertTitle>{file.name}</AlertTitle>
            <AlertDescription>{t('import.upload.selected', { size: Math.ceil(file.size / 1024) })}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
      <CardFooter className="justify-end">
        <Button type="button" disabled={!file || isReading} onClick={() => void continueToMapping()}>
          {isReading ? <Spinner data-icon="inline-start" /> : <UploadIcon data-icon="inline-start" />}
          {t('import.continue')}
        </Button>
      </CardFooter>
    </Card>
  );
}
