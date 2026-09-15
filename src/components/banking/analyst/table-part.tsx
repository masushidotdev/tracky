import { hasSafeCells, isRecord, isSafeDataKey } from './helpers';
import { Amount } from '@/components/app/amount';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatIsoDate } from '@/lib/format';
import { moneyFromMajor } from '@/lib/money';
import { useI18n } from '@/lib/i18n';

type Column = { key: string; label: string; align?: 'left' | 'center' | 'right'; format?: 'money' | 'date' | 'text' };

export function TablePart({ output }: { output: unknown }) {
  const { intlLocale } = useI18n();
  if (
    !isRecord(output) ||
    typeof output.title !== 'string' ||
    !Array.isArray(output.columns) ||
    !Array.isArray(output.rows)
  )
    return null;
  const columns = output.columns.filter(isRecord).flatMap(
    (column): Array<Column> =>
      isSafeDataKey(column.key) && typeof column.label === 'string'
        ? [
            {
              key: column.key,
              label: column.label,
              align: column.align === 'center' || column.align === 'right' ? column.align : 'left',
              format: column.format === 'money' || column.format === 'date' ? column.format : 'text',
            },
          ]
        : [],
  );
  const rows = output.rows.filter(isRecord).filter(hasSafeCells).slice(0, 50);
  if (columns.length === 0) return null;
  return (
    <section className="my-3 overflow-hidden rounded-3xl border bg-card">
      <h3 className="px-4 pt-4 text-sm font-semibold">{output.title}</h3>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead
                key={column.key}
                className={
                  column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : undefined
                }
              >
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={index}>
              {columns.map((column) => {
                const value = row[column.key];
                const currencyValue =
                  typeof row.currency === 'string' && /^[A-Z]{3}$/.test(row.currency)
                    ? row.currency
                    : typeof output.currency === 'string' && /^[A-Z]{3}$/.test(output.currency)
                      ? output.currency
                      : undefined;
                return (
                  <TableCell
                    key={column.key}
                    className={
                      column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : undefined
                    }
                  >
                    {column.format === 'money' && typeof value === 'number' && currencyValue ? (
                      <Amount money={moneyFromMajor(value, currencyValue)} />
                    ) : column.format === 'date' && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? (
                      formatIsoDate(value, intlLocale)
                    ) : (
                      String(value ?? '—')
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
