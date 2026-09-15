import * as React from 'react';
import { ArrowLeftIcon, ArrowRightIcon } from 'lucide-react';

import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import type { CsvColumnMapping, CsvDateFormat } from '@/lib/csv/parse';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useI18n } from '@/lib/i18n';
import { categoryDisplayName } from '@/lib/categories';

const NONE = '__none__';

function guessColumn(headers: Array<string>, candidates: Array<string>) {
  const match = headers.find((header) => {
    const normalized = header.toLocaleLowerCase().replace(/[^a-z0-9]/g, '');
    return candidates.some((candidate) => normalized.includes(candidate));
  });
  return match ?? headers.at(0) ?? '';
}

function ColumnSelect({
  headers,
  id,
  optional = false,
  value,
  onValueChange,
}: {
  headers: Array<string>;
  id: string;
  optional?: boolean;
  value: string;
  onValueChange: (value: string) => void;
}) {
  const { t } = useI18n();
  return (
    <Select value={value || (optional ? NONE : undefined)} onValueChange={onValueChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={t('import.mapping.chooseColumn')} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {optional ? <SelectItem value={NONE}>{t('import.mapping.none')}</SelectItem> : null}
          {headers.map((header) => (
            <SelectItem key={header} value={header}>
              {header}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

export function ColumnMappingStep({
  accounts,
  categories,
  headers,
  isPreparing,
  onBack,
  onContinue,
}: {
  accounts: Array<Doc<'financialAccounts'>>;
  categories: Array<Doc<'categories'>>;
  headers: Array<string>;
  isPreparing: boolean;
  onBack: () => void;
  onContinue: (value: {
    accountId: Id<'financialAccounts'>;
    categoryId?: Id<'categories'>;
    mapping: CsvColumnMapping;
  }) => void;
}) {
  const { t } = useI18n();
  const [accountId, setAccountId] = React.useState<Id<'financialAccounts'>>(accounts[0]._id);
  const [categoryId, setCategoryId] = React.useState<string>(NONE);
  const [amountMode, setAmountMode] = React.useState<'signed' | 'split'>('signed');
  const [dateColumn, setDateColumn] = React.useState(() => guessColumn(headers, ['bookingdate', 'date', 'data']));
  const [descriptionColumn, setDescriptionColumn] = React.useState(() =>
    guessColumn(headers, ['description', 'descrizione', 'causale', 'details']),
  );
  const [counterpartyColumn, setCounterpartyColumn] = React.useState(() => {
    const guessed = guessColumn(headers, ['counterparty', 'merchant', 'beneficiary', 'controparte']);
    return guessed === headers[0] ? NONE : guessed;
  });
  const [amountColumn, setAmountColumn] = React.useState(() => guessColumn(headers, ['amount', 'importo']));
  const [debitColumn, setDebitColumn] = React.useState(() => guessColumn(headers, ['debit', 'addebito', 'outflow']));
  const [creditColumn, setCreditColumn] = React.useState(() => guessColumn(headers, ['credit', 'accredito', 'inflow']));
  const [dateFormat, setDateFormat] = React.useState<CsvDateFormat>('auto');

  const canContinue =
    Boolean(accountId && dateColumn && descriptionColumn) &&
    (amountMode === 'signed'
      ? Boolean(amountColumn)
      : Boolean(debitColumn && creditColumn && debitColumn !== creditColumn));

  function submit() {
    if (!canContinue) return;
    const common = {
      bookingDateColumn: dateColumn,
      descriptionColumn,
      counterpartyNameColumn: counterpartyColumn === NONE ? undefined : counterpartyColumn,
      dateFormat,
    };
    const mapping: CsvColumnMapping =
      amountMode === 'signed'
        ? { ...common, amountMode, amountColumn }
        : { ...common, amountMode, debitColumn, creditColumn };
    onContinue({
      accountId,
      categoryId: categoryId === NONE ? undefined : (categoryId as Id<'categories'>),
      mapping,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('import.mapping.title')}</CardTitle>
        <CardDescription>{t('import.mapping.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup className="grid md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="importAccount">{t('import.mapping.account')}</FieldLabel>
            <Select value={accountId} onValueChange={(value) => setAccountId(value as Id<'financialAccounts'>)}>
              <SelectTrigger id="importAccount" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {accounts.map((account) => (
                    <SelectItem key={account._id} value={account._id}>
                      {account.alias || account.name} · {account.currency}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="importCategory">{t('import.mapping.category')}</FieldLabel>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="importCategory" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={NONE}>{t('import.mapping.autoCategory')}</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category._id} value={category._id}>
                      {categoryDisplayName(category, t)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>{t('import.mapping.categoryHint')}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="dateColumn">{t('import.mapping.date')}</FieldLabel>
            <ColumnSelect id="dateColumn" headers={headers} value={dateColumn} onValueChange={setDateColumn} />
          </Field>
          <Field>
            <FieldLabel htmlFor="dateFormat">{t('import.mapping.dateFormat')}</FieldLabel>
            <Select value={dateFormat} onValueChange={(value) => setDateFormat(value as CsvDateFormat)}>
              <SelectTrigger id="dateFormat" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {(['auto', 'YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'DD.MM.YYYY'] as const).map((format) => (
                    <SelectItem key={format} value={format}>
                      {format === 'auto' ? t('import.mapping.autoDate') : format}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="descriptionColumn">{t('import.mapping.descriptionColumn')}</FieldLabel>
            <ColumnSelect
              id="descriptionColumn"
              headers={headers}
              value={descriptionColumn}
              onValueChange={setDescriptionColumn}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="counterpartyColumn">{t('import.mapping.counterparty')}</FieldLabel>
            <ColumnSelect
              id="counterpartyColumn"
              headers={headers}
              optional
              value={counterpartyColumn}
              onValueChange={setCounterpartyColumn}
            />
          </Field>
          <Field className="md:col-span-2">
            <FieldLabel>{t('import.mapping.amountMode')}</FieldLabel>
            <ToggleGroup
              type="single"
              value={amountMode}
              onValueChange={(value) => value && setAmountMode(value as 'signed' | 'split')}
              variant="outline"
            >
              <ToggleGroupItem value="signed">{t('import.mapping.signed')}</ToggleGroupItem>
              <ToggleGroupItem value="split">{t('import.mapping.split')}</ToggleGroupItem>
            </ToggleGroup>
          </Field>
          {amountMode === 'signed' ? (
            <Field className="md:col-span-2">
              <FieldLabel htmlFor="amountColumn">{t('import.mapping.amount')}</FieldLabel>
              <ColumnSelect id="amountColumn" headers={headers} value={amountColumn} onValueChange={setAmountColumn} />
              <FieldDescription>{t('import.mapping.signedHint')}</FieldDescription>
            </Field>
          ) : (
            <>
              <Field>
                <FieldLabel htmlFor="debitColumn">{t('import.mapping.debit')}</FieldLabel>
                <ColumnSelect id="debitColumn" headers={headers} value={debitColumn} onValueChange={setDebitColumn} />
              </Field>
              <Field>
                <FieldLabel htmlFor="creditColumn">{t('import.mapping.credit')}</FieldLabel>
                <ColumnSelect
                  id="creditColumn"
                  headers={headers}
                  value={creditColumn}
                  onValueChange={setCreditColumn}
                />
              </Field>
            </>
          )}
        </FieldGroup>
      </CardContent>
      <CardFooter className="justify-between gap-2">
        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeftIcon data-icon="inline-start" />
          {t('import.back')}
        </Button>
        <Button type="button" disabled={!canContinue || isPreparing} onClick={submit}>
          {isPreparing ? <Spinner data-icon="inline-start" /> : null}
          {t('import.preview.action')}
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
      </CardFooter>
    </Card>
  );
}
