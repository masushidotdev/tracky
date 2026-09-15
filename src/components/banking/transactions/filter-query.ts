import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import { parseMoneyMinor } from '@/lib/money';

export const transactionSortKeys = [
  'bookingDate',
  'account',
  'counterpartyName',
  'description',
  'classificationKind',
  'category',
  'note',
  'outflow',
  'inflow',
] as const;

export type TransactionSortKey = (typeof transactionSortKeys)[number];
export type TransactionSortDirection = 'asc' | 'desc';

export function isTransactionSortKey(value: unknown): value is TransactionSortKey {
  return typeof value === 'string' && (transactionSortKeys as ReadonlyArray<string>).includes(value);
}

export type FilterClause =
  | { kind: 'account'; accountId: Id<'financialAccounts'> }
  | { kind: 'category'; categoryId: Id<'categories'> }
  | { kind: 'classification'; value: Doc<'transactions'>['classificationKind'] }
  | { kind: 'status'; value: Doc<'transactions'>['status'] }
  | { kind: 'dateOn' | 'dateBefore' | 'dateAfter'; date: string }
  | { kind: 'outflow' | 'inflow'; op: 'eq' | 'gte' | 'lte'; amountMinor: bigint }
  | { kind: 'text'; field: 'any' | 'payee' | 'category' | 'memo'; value: string };

export type FilterSuggestion = {
  id: string;
  label: string;
  insertText: string;
  clause: FilterClause;
};

export type FilterQueryLabels = {
  account: string;
  category: string;
  payee: string;
  classification: string;
  status: string;
  on: string;
  before: string;
  after: string;
  outflow: string;
  inflow: string;
  equals: string;
  atLeast: string;
  atMost: string;
  findAny: string;
  findPayee: string;
  findCategory: string;
  findMemo: string;
};

export type FilterQueryContext = {
  accounts: Array<{ accountId: Id<'financialAccounts'>; label: string }>;
  categories: Array<{ categoryId: Id<'categories'>; label: string }>;
  payees: Array<string>;
  locale: string;
  currency: string;
  today: string;
  labels: FilterQueryLabels;
};

export type TransactionQueryFilters = {
  accountId?: Id<'financialAccounts'>;
  categoryId?: Id<'categories'>;
  classificationKind?: Doc<'transactions'>['classificationKind'];
  status?: Doc<'transactions'>['status'];
  fromDate?: string;
  toDate?: string;
  amountFilters?: Array<{
    direction: Doc<'transactions'>['direction'];
    op: 'eq' | 'gte' | 'lte';
    amountMinor: bigint;
  }>;
  textFilters?: Array<{
    field: 'any' | 'payee' | 'category' | 'memo';
    value: string;
  }>;
};

const classificationValues: Array<Doc<'transactions'>['classificationKind']> = [
  'uncategorized',
  'expense',
  'income',
  'subscription',
  'transfer',
  'internal',
];
const statusValues: Array<Doc<'transactions'>['status']> = ['BOOK', 'PDNG', 'SCHD', 'HOLD', 'CNCL', 'RJCT', 'OTHR'];

function normalize(value: string) {
  return value.trim().toLocaleLowerCase();
}

function replaceValue(template: string, value: string) {
  return template.replace('{value}', value);
}

function aliases(primary: string, english: string) {
  return primary === english ? [primary] : [primary, english];
}

function valueAfterLabel(token: string, labels: Array<string>) {
  for (const label of labels) {
    const prefix = `${label}:`;
    if (token.toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase())) {
      return token.slice(prefix.length).trim();
    }
  }
  return null;
}

function dateOrder(locale: string) {
  const parts = new Intl.DateTimeFormat(locale).formatToParts(new Date(Date.UTC(2001, 10, 22)));
  return parts
    .filter((part) => part.type === 'day' || part.type === 'month' || part.type === 'year')
    .map((part) => part.type) as Array<'day' | 'month' | 'year'>;
}

function dateParts(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return { year, month, day };
}

function isValidDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function parsePartialDate(value: string, ctx: FilterQueryContext) {
  const trimmed = value.trim();
  if (!/^\d{1,4}(?:\/\d{0,4}){0,2}$/.test(trimmed)) return null;

  const rawParts = trimmed.split('/');
  if (rawParts.length > 3) return null;
  const order = dateOrder(ctx.locale);
  const today = dateParts(ctx.today);
  const resolved = { ...today };

  for (let index = 0; index < rawParts.length; index += 1) {
    if (!rawParts[index]) continue;
    resolved[order[index]] = Number(rawParts[index]);
  }

  // A lone leading number is a day far more often than a month, and in a month-first locale
  // "24" or "26/" would otherwise be month 24 — invalid, so no date suggestion appeared at all.
  // Fall back to reading it as a day of the current month before giving up.
  if (!isValidDate(resolved.year, resolved.month, resolved.day) && order[0] !== 'day') {
    const leading = Number(rawParts[0]);
    const dayFirst = { ...today, day: leading };
    if (rawParts.length <= 2 && isValidDate(dayFirst.year, dayFirst.month, dayFirst.day)) {
      resolved.day = leading;
      resolved.month = today.month;
      resolved.year = today.year;
    }
  }

  if (!isValidDate(resolved.year, resolved.month, resolved.day)) return null;
  const isoDate = `${String(resolved.year).padStart(4, '0')}-${String(resolved.month).padStart(2, '0')}-${String(resolved.day).padStart(2, '0')}`;
  const display = order
    .map((part) => String(resolved[part]).padStart(part === 'year' ? 4 : 2, '0'))
    .join('/');
  return { isoDate, display };
}

function parseCanonicalClause(token: string): FilterClause | null {
  const [kind, first, ...rest] = token.split(':');
  const value = rest.length > 0 ? [first, ...rest].join(':') : first;
  if (kind === 'account' && value) return { kind, accountId: value as Id<'financialAccounts'> };
  if (kind === 'category' && value) return { kind, categoryId: value as Id<'categories'> };
  if (kind === 'classification' && classificationValues.includes(value as Doc<'transactions'>['classificationKind'])) {
    return { kind, value: value as Doc<'transactions'>['classificationKind'] };
  }
  if (kind === 'status' && statusValues.includes(value as Doc<'transactions'>['status'])) {
    return { kind, value: value as Doc<'transactions'>['status'] };
  }
  if ((kind === 'dateOn' || kind === 'dateBefore' || kind === 'dateAfter') && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { kind, date: value };
  }
  if (kind === 'outflow' || kind === 'inflow') {
    const amount = rest.join(':');
    if (['eq', 'gte', 'lte'].includes(first) && /^-?\d+$/.test(amount)) {
      return { kind, op: first as 'eq' | 'gte' | 'lte', amountMinor: BigInt(amount) };
    }
  }
  if (kind === 'text') {
    if (['any', 'payee', 'category', 'memo'].includes(first) && rest.length > 0) {
      return {
        kind,
        field: first as 'any' | 'payee' | 'category' | 'memo',
        value: decodeURIComponent(rest.join(':')),
      };
    }
  }
  return null;
}

function parseAmountClause(token: string, ctx: FilterQueryContext, kind: 'outflow' | 'inflow') {
  const directionLabel = kind === 'outflow' ? ctx.labels.outflow : ctx.labels.inflow;
  const value = valueAfterLabel(token, aliases(directionLabel, kind === 'outflow' ? 'Outflow' : 'Inflow'));
  if (value === null) return null;
  const match = value.match(/^(=|≥|>=|≤|<=)\s*(.+)$/);
  if (!match) return null;
  try {
    return {
      kind,
      op: match[1] === '=' ? ('eq' as const) : match[1] === '≥' || match[1] === '>=' ? ('gte' as const) : ('lte' as const),
      amountMinor: parseMoneyMinor(match[2], ctx.currency, ctx.locale),
    };
  } catch {
    return null;
  }
}

function parseDisplayClause(token: string, ctx: FilterQueryContext): FilterClause | null {
  const accountValue = valueAfterLabel(token, aliases(ctx.labels.account, 'Account'));
  if (accountValue !== null) {
    const account = ctx.accounts.find(
      (candidate) => normalize(candidate.label) === normalize(accountValue) || candidate.accountId === accountValue,
    );
    return account ? { kind: 'account', accountId: account.accountId } : null;
  }

  const categoryValue = valueAfterLabel(token, aliases(ctx.labels.category, 'Category'));
  if (categoryValue !== null) {
    const category = ctx.categories.find(
      (candidate) => normalize(candidate.label) === normalize(categoryValue) || candidate.categoryId === categoryValue,
    );
    return category
      ? { kind: 'category', categoryId: category.categoryId }
      : categoryValue
        ? { kind: 'text', field: 'category', value: categoryValue }
        : null;
  }

  const classificationValue = valueAfterLabel(token, aliases(ctx.labels.classification, 'Classification'));
  if (classificationValue !== null) {
    const value = classificationValues.find((candidate) => normalize(candidate) === normalize(classificationValue));
    return value ? { kind: 'classification', value } : null;
  }

  const statusValue = valueAfterLabel(token, aliases(ctx.labels.status, 'Status'));
  if (statusValue !== null) {
    const value = statusValues.find((candidate) => normalize(candidate) === normalize(statusValue));
    return value ? { kind: 'status', value } : null;
  }

  for (const [kind, label, english] of [
    ['dateOn', ctx.labels.on, 'On'],
    ['dateBefore', ctx.labels.before, 'Before'],
    ['dateAfter', ctx.labels.after, 'After'],
  ] as const) {
    const dateValue = valueAfterLabel(token, aliases(label, english));
    if (dateValue !== null) {
      const parsed = parsePartialDate(dateValue, ctx);
      return parsed ? { kind, date: parsed.isoDate } : null;
    }
  }

  const outflow = parseAmountClause(token, ctx, 'outflow');
  if (outflow) return outflow;
  const inflow = parseAmountClause(token, ctx, 'inflow');
  if (inflow) return inflow;

  const payeeValue = valueAfterLabel(token, aliases(ctx.labels.payee, 'Payee'));
  if (payeeValue !== null) {
    const payee = ctx.payees.find((candidate) => normalize(candidate) === normalize(payeeValue));
    return { kind: 'text', field: 'payee', value: payee ?? payeeValue };
  }
  const memoValue = valueAfterLabel(token, ['Memo']);
  if (memoValue !== null) return memoValue ? { kind: 'text', field: 'memo', value: memoValue } : null;
  const findValue = valueAfterLabel(token, ['Find']);
  if (findValue !== null) return findValue ? { kind: 'text', field: 'any', value: findValue } : null;
  return null;
}

export function parseFilterQuery(input: string, ctx: FilterQueryContext): { clauses: Array<FilterClause>; activeToken: string } {
  const segments = input.split(/,\s+/);
  const activeToken = segments.pop() ?? '';
  const clauses = segments.flatMap((segment) => {
    const clause = parseCanonicalClause(segment.trim()) ?? parseDisplayClause(segment.trim(), ctx);
    return clause ? [clause] : [];
  });
  return { clauses, activeToken };
}

export function serializeFilterQuery(clauses: Array<FilterClause>) {
  if (clauses.length === 0) return '';
  const serialized = clauses.map((clause) => {
    switch (clause.kind) {
      case 'account':
        return `account:${clause.accountId}`;
      case 'category':
        return `category:${clause.categoryId}`;
      case 'classification':
      case 'status':
        return `${clause.kind}:${clause.value}`;
      case 'dateOn':
      case 'dateBefore':
      case 'dateAfter':
        return `${clause.kind}:${clause.date}`;
      case 'outflow':
      case 'inflow':
        return `${clause.kind}:${clause.op}:${clause.amountMinor}`;
      case 'text':
        return `text:${clause.field}:${encodeURIComponent(clause.value)}`;
    }
  });
  return `${serialized.join(', ')}, `;
}

function entitySuggestion(id: string, label: string, value: string, clause: FilterClause): FilterSuggestion {
  return { id, label: `${label}: ${value}`, insertText: `${label}: ${value}`, clause };
}

function amountSuggestions(
  kind: 'outflow' | 'inflow',
  amountMinor: bigint,
  token: string,
  ctx: FilterQueryContext,
): Array<FilterSuggestion> {
  const direction = kind === 'outflow' ? ctx.labels.outflow : ctx.labels.inflow;
  return [
    { op: 'eq' as const, symbol: '=', label: ctx.labels.equals },
    { op: 'gte' as const, symbol: '≥', label: ctx.labels.atLeast },
    { op: 'lte' as const, symbol: '≤', label: ctx.labels.atMost },
  ].map(({ op, symbol, label }) => ({
    id: `${kind}:${op}:${amountMinor}`,
    label: `${direction} ${label} ${token}`,
    insertText: `${direction}: ${symbol} ${token}`,
    clause: { kind, op, amountMinor },
  }));
}

export function suggestFor(activeToken: string, ctx: FilterQueryContext): Array<FilterSuggestion> {
  const token = activeToken.trim();
  const normalizedToken = normalize(token);
  const suggestions: Array<FilterSuggestion> = [];
  const matchesPrefix = (value: string) => !normalizedToken || normalize(value).startsWith(normalizedToken);

  for (const account of ctx.accounts) {
    if (matchesPrefix(account.label)) {
      suggestions.push(entitySuggestion(`account:${account.accountId}`, ctx.labels.account, account.label, { kind: 'account', accountId: account.accountId }));
    }
  }
  for (const category of ctx.categories) {
    if (matchesPrefix(category.label)) {
      suggestions.push(entitySuggestion(`category:${category.categoryId}`, ctx.labels.category, category.label, { kind: 'category', categoryId: category.categoryId }));
    }
  }
  for (const payee of [...new Set(ctx.payees)].sort((left, right) => left.localeCompare(right))) {
    if (matchesPrefix(payee)) {
      suggestions.push(entitySuggestion(`payee:${payee}`, ctx.labels.payee, payee, { kind: 'text', field: 'payee', value: payee }));
    }
  }

  const classificationPrefix = valueAfterLabel(token, aliases(ctx.labels.classification, 'Classification'));
  const classificationSearch = classificationPrefix ?? token;
  for (const value of classificationValues.filter((candidate) =>
    normalize(candidate).startsWith(normalize(classificationSearch)),
  )) {
    suggestions.push(
      entitySuggestion(`classification:${value}`, ctx.labels.classification, value, { kind: 'classification', value }),
    );
  }
  const statusPrefix = valueAfterLabel(token, aliases(ctx.labels.status, 'Status'));
  const statusSearch = statusPrefix ?? token;
  for (const value of statusValues.filter((candidate) => normalize(candidate).startsWith(normalize(statusSearch)))) {
    suggestions.push(entitySuggestion(`status:${value}`, ctx.labels.status, value, { kind: 'status', value }));
  }

  const parsedDate = parsePartialDate(token, ctx);
  if (parsedDate) {
    for (const [kind, label] of [
      ['dateOn', ctx.labels.on],
      ['dateBefore', ctx.labels.before],
      ['dateAfter', ctx.labels.after],
    ] as const) {
      suggestions.push({
        id: `${kind}:${parsedDate.isoDate}`,
        label: `${label}: ${parsedDate.display}`,
        insertText: `${label}: ${parsedDate.display}`,
        clause: { kind, date: parsedDate.isoDate },
      });
    }
  }

  if (token) {
    try {
      const amountMinor = parseMoneyMinor(token, ctx.currency, ctx.locale);
      if (/^[+-]?[\d\s'.,]+$/.test(token)) {
        suggestions.push(...amountSuggestions('outflow', amountMinor, token, ctx));
        suggestions.push(...amountSuggestions('inflow', amountMinor, token, ctx));
      }
    } catch {
      // Not a monetary token; text suggestions still apply.
    }

    suggestions.push({
      id: `text:any:${token}`,
      label: replaceValue(ctx.labels.findAny, token),
      insertText: `Find: ${token}`,
      clause: { kind: 'text', field: 'any', value: token },
    });
    for (const [field, label, insertLabel] of [
      ['payee', ctx.labels.findPayee, ctx.labels.payee],
      ['category', ctx.labels.findCategory, ctx.labels.category],
      ['memo', ctx.labels.findMemo, 'Memo'],
    ] as const) {
      suggestions.push({
        id: `text:${field}:${token}`,
        label: replaceValue(label, token),
        insertText: `${insertLabel}: ${token}`,
        clause: { kind: 'text', field, value: token },
      });
    }
  }

  return suggestions;
}

function shiftIsoDate(date: string, days: number) {
  const shifted = new Date(`${date}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

export function toTransactionFilters(clauses: Array<FilterClause>): TransactionQueryFilters {
  const filters: TransactionQueryFilters = {};
  const amountFilters: NonNullable<TransactionQueryFilters['amountFilters']> = [];
  const textFilters: NonNullable<TransactionQueryFilters['textFilters']> = [];

  for (const clause of clauses) {
    switch (clause.kind) {
      case 'account':
        filters.accountId = clause.accountId;
        break;
      case 'category':
        filters.categoryId = clause.categoryId;
        break;
      case 'classification':
        filters.classificationKind = clause.value;
        break;
      case 'status':
        filters.status = clause.value;
        break;
      case 'dateOn':
        filters.fromDate = clause.date;
        filters.toDate = clause.date;
        break;
      case 'dateAfter': {
        const fromDate = shiftIsoDate(clause.date, 1);
        filters.fromDate = !filters.fromDate || fromDate > filters.fromDate ? fromDate : filters.fromDate;
        break;
      }
      case 'dateBefore': {
        const toDate = shiftIsoDate(clause.date, -1);
        filters.toDate = !filters.toDate || toDate < filters.toDate ? toDate : filters.toDate;
        break;
      }
      case 'outflow':
      case 'inflow':
        amountFilters.push({
          direction: clause.kind === 'outflow' ? 'DBIT' : 'CRDT',
          op: clause.op,
          amountMinor: clause.amountMinor,
        });
        break;
      case 'text':
        textFilters.push({ field: clause.field, value: clause.value });
        break;
    }
  }

  if (amountFilters.length > 0) filters.amountFilters = amountFilters;
  if (textFilters.length > 0) filters.textFilters = textFilters;
  return filters;
}
