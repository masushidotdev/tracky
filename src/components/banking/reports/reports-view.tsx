import * as React from 'react';
import { useMutation, useQuery } from 'convex/react';
import {
  BarChart3Icon,
  ChartPieIcon,
  DownloadIcon,
  GitBranchIcon,
  Layers3Icon,
  Rows3Icon,
} from 'lucide-react';
import { toast } from 'sonner';

import { api } from '../../../../convex/_generated/api';
import { CashflowSankey } from './cashflow-sankey';
import { ReportFiltersBar } from './report-filters-bar';
import { ReportSummaryCards } from './report-summary-cards';
import { ReportTransactionsSheet } from './report-transactions-sheet';
import { ReportTrendsChart } from './report-trends-chart';
import { createCsv, minorToDecimal, resolveDatePreset } from './report-utils';
import { SavedReportsMenu } from './saved-reports-menu';
import { SpendingBreakdownChart } from './spending-breakdown-chart';
import type {
  ReportChartType,
  ReportFiltersState,
  ReportMode,
  ReportSegmentSelection,
  ReportTab,
  ReportTransaction,
  SavedReportConfig,
} from './types';
import type { Id } from '../../../../convex/_generated/dataModel';
import { EmptyState } from '@/components/app/empty-state';
import { PanelSkeleton, StatRowSkeleton } from '@/components/app/skeletons';
import { PanelErrorBoundary } from '@/components/banking/panel-error-boundary';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useI18n } from '@/lib/i18n';
import { moneyInputValue, parseMoneyMinor } from '@/lib/money';

function initialFilters(): ReportFiltersState {
  const range = resolveDatePreset('last12Months', '', '');
  return {
    datePreset: 'last12Months',
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    groupBy: 'category',
    granularity: 'month',
    accountIds: [],
    categoryIds: [],
    tagIds: [],
    amountMin: '',
    amountMax: '',
  };
}

function chartTypeFor(tab: ReportTab, mode: ReportMode): ReportChartType {
  if (mode === 'trends') {
    return 'barGrouped';
  }
  return tab === 'cashflow' ? 'sankey' : 'donut';
}

export function ReportsView() {
  const { intlLocale, t } = useI18n();
  const [tab, setTab] = React.useState<ReportTab>('cashflow');
  const [mode, setMode] = React.useState<ReportMode>('breakdown');
  const [chartType, setChartType] = React.useState<ReportChartType>('sankey');
  const [filters, setFilters] = React.useState<ReportFiltersState>(initialFilters);
  const [selection, setSelection] = React.useState<ReportSegmentSelection | null>(null);
  const [transactionRows, setTransactionRows] = React.useState<Array<ReportTransaction>>([]);
  const [transactionCursor, setTransactionCursor] = React.useState<string | undefined>();
  const [nextTransactionCursor, setNextTransactionCursor] = React.useState<string | null>(null);
  const processedTransactionPages = React.useRef(new Set<string>());

  const accountsResult = useQuery(api.banking.accounts.listSyncOverview, { limit: 200 });
  const categoriesResult = useQuery(api.banking.categories.listCategories, { limit: 200 });
  const tagsResult = useQuery(api.banking.transactionMeta.listTags, {});
  const savedReports = useQuery(api.banking.savedReports.listSavedReports, {});
  const createSavedReport = useMutation(api.banking.savedReports.createSavedReport);
  const updateSavedReport = useMutation(api.banking.savedReports.updateSavedReport);
  const deleteSavedReport = useMutation(api.banking.savedReports.deleteSavedReport);

  const accounts = React.useMemo(() => {
    if (!accountsResult) {
      return undefined;
    }
    return [...new Map(accountsResult.map(({ account }) => [account._id, account])).values()]
      .map((account) => ({ id: account._id, label: account.alias?.trim() || account.name }))
      .sort((left, right) => left.label.localeCompare(right.label, intlLocale));
  }, [accountsResult, intlLocale]);
  const categories = React.useMemo(
    () =>
      categoriesResult
        ?.map((category) => ({
          id: category._id,
          label: category.name,
        }))
        .sort((left, right) => left.label.localeCompare(right.label, intlLocale)),
    [categoriesResult, intlLocale],
  );
  const tags = React.useMemo(
    () =>
      tagsResult
        ?.map((tag) => ({ id: tag._id, label: tag.name, color: tag.color }))
        .sort((left, right) => left.label.localeCompare(right.label, intlLocale)),
    [intlLocale, tagsResult],
  );

  React.useEffect(() => {
    if (!tagsResult) return;
    const availableTagIds = new Set(tagsResult.map((tag) => tag._id));
    setFilters((current) => {
      const tagIds = current.tagIds.filter((tagId) => availableTagIds.has(tagId));
      return tagIds.length === current.tagIds.length ? current : { ...current, tagIds };
    });
  }, [tagsResult]);

  const dateRange = React.useMemo(
    () => resolveDatePreset(filters.datePreset, filters.dateFrom, filters.dateTo),
    [filters.dateFrom, filters.datePreset, filters.dateTo],
  );
  const parsedFilters = React.useMemo(() => {
    try {
      const amountMinMinor = filters.amountMin.trim()
        ? parseMoneyMinor(filters.amountMin, 'EUR', intlLocale)
        : undefined;
      const amountMaxMinor = filters.amountMax.trim()
        ? parseMoneyMinor(filters.amountMax, 'EUR', intlLocale)
        : undefined;
      const datesValid = /^\d{4}-\d{2}-\d{2}$/.test(dateRange.dateFrom) && /^\d{4}-\d{2}-\d{2}$/.test(dateRange.dateTo);
      const valid =
        datesValid &&
        dateRange.dateFrom <= dateRange.dateTo &&
        (amountMinMinor === undefined || amountMinMinor >= 0n) &&
        (amountMaxMinor === undefined || amountMaxMinor >= 0n) &&
        (amountMinMinor === undefined || amountMaxMinor === undefined || amountMinMinor <= amountMaxMinor);
      return { valid, amountMinMinor, amountMaxMinor };
    } catch {
      return { valid: false, amountMinMinor: undefined, amountMaxMinor: undefined };
    }
  }, [dateRange.dateFrom, dateRange.dateTo, filters.amountMax, filters.amountMin, intlLocale]);

  const reportArgs = parsedFilters.valid
    ? {
        tab,
        groupBy: filters.groupBy,
        granularity: filters.granularity,
        dateFrom: dateRange.dateFrom,
        dateTo: dateRange.dateTo,
        accountIds: filters.accountIds.length > 0 ? filters.accountIds : undefined,
        categoryIds: filters.categoryIds.length > 0 ? filters.categoryIds : undefined,
        tagIds: filters.tagIds.length > 0 ? filters.tagIds : undefined,
        amountMinMinor: parsedFilters.amountMinMinor,
        amountMaxMinor: parsedFilters.amountMaxMinor,
      }
    : null;
  const report = useQuery(api.banking.reports.getReport, reportArgs ?? 'skip');

  const transactionPage = useQuery(
    api.banking.reports.listReportTransactions,
    selection && reportArgs
      ? {
          tab: reportArgs.tab,
          groupBy: reportArgs.groupBy,
          dateFrom: reportArgs.dateFrom,
          dateTo: reportArgs.dateTo,
          accountIds: reportArgs.accountIds,
          categoryIds: reportArgs.categoryIds,
          tagIds: reportArgs.tagIds,
          amountMinMinor: reportArgs.amountMinMinor,
          amountMaxMinor: reportArgs.amountMaxMinor,
          groupKey: selection.groupKey,
          cursor: transactionCursor,
          limit: 50,
        }
      : 'skip',
  );

  React.useEffect(() => {
    if (!selection || !transactionPage) {
      return;
    }
    const pageKey = `${selection.groupKey}:${transactionCursor ?? 'first'}`;
    if (processedTransactionPages.current.has(pageKey)) {
      return;
    }
    processedTransactionPages.current.add(pageKey);
    const currencyRows = transactionPage.page.filter((row) => row.amount.currency === selection.currency);
    setTransactionRows((current) => [...current, ...currencyRows]);
    setNextTransactionCursor(transactionPage.continueCursor);
  }, [selection, transactionCursor, transactionPage]);

  const changeTab = (nextTab: ReportTab) => {
    setTab(nextTab);
    setChartType(chartTypeFor(nextTab, mode));
  };
  const changeMode = (nextMode: ReportMode) => {
    setMode(nextMode);
    setChartType(chartTypeFor(tab, nextMode));
  };
  const openSegment = (nextSelection: ReportSegmentSelection) => {
    processedTransactionPages.current.clear();
    setTransactionRows([]);
    setTransactionCursor(undefined);
    setNextTransactionCursor(null);
    setSelection(nextSelection);
  };
  const closeTransactions = (open: boolean) => {
    if (!open) {
      processedTransactionPages.current.clear();
      setSelection(null);
      setTransactionRows([]);
      setTransactionCursor(undefined);
      setNextTransactionCursor(null);
    }
  };

  const currentSavedConfig = (): SavedReportConfig => ({
    tab,
    mode,
    chartType,
    groupBy: filters.groupBy,
    granularity: filters.granularity,
    datePreset: filters.datePreset,
    dateFrom: filters.datePreset === 'custom' ? filters.dateFrom : undefined,
    dateTo: filters.datePreset === 'custom' ? filters.dateTo : undefined,
    accountIds: filters.accountIds,
    categoryIds: filters.categoryIds,
    tagIds: filters.tagIds,
    amountMinMinor: parsedFilters.amountMinMinor,
    amountMaxMinor: parsedFilters.amountMaxMinor,
  });
  const applySavedReport = (config: SavedReportConfig) => {
    const fallbackRange = resolveDatePreset(config.datePreset ?? 'last12Months', config.dateFrom ?? '', config.dateTo ?? '');
    const availableTagIds = tagsResult ? new Set(tagsResult.map((tag) => tag._id)) : null;
    setTab(config.tab);
    setMode(config.mode);
    setChartType(config.chartType);
    setFilters({
      datePreset: config.datePreset ?? (config.dateFrom && config.dateTo ? 'custom' : 'last12Months'),
      dateFrom: config.dateFrom ?? fallbackRange.dateFrom,
      dateTo: config.dateTo ?? fallbackRange.dateTo,
      groupBy: config.groupBy,
      granularity: config.granularity ?? 'month',
      accountIds: config.accountIds ?? [],
      categoryIds: config.categoryIds ?? [],
      tagIds: availableTagIds ? (config.tagIds ?? []).filter((tagId) => availableTagIds.has(tagId)) : (config.tagIds ?? []),
      amountMin:
        config.amountMinMinor === undefined
          ? ''
          : moneyInputValue({ amountMinor: config.amountMinMinor, currency: 'EUR' }, intlLocale),
      amountMax:
        config.amountMaxMinor === undefined
          ? ''
          : moneyInputValue({ amountMinor: config.amountMaxMinor, currency: 'EUR' }, intlLocale),
    });
  };

  const saveCurrentReport = async (name: string) => {
    if (!parsedFilters.valid) {
      toast.error(t('reports.invalid.description'));
      throw new Error(t('reports.invalid.description'));
    }
    try {
      await createSavedReport({ name, config: currentSavedConfig() });
      toast.success(t('reports.saved.saved'));
    } catch {
      toast.error(t('reports.saved.saveFailed'));
      throw new Error(t('reports.saved.saveFailed'));
    }
  };
  const renameSavedReport = async (savedReportId: Id<'savedReports'>, name: string) => {
    try {
      await updateSavedReport({ savedReportId, name });
      toast.success(t('reports.saved.renamed'));
    } catch {
      toast.error(t('reports.saved.renameFailed'));
      throw new Error(t('reports.saved.renameFailed'));
    }
  };
  const removeSavedReport = async (savedReportId: Id<'savedReports'>) => {
    try {
      await deleteSavedReport({ savedReportId });
      toast.success(t('reports.saved.deleted'));
    } catch {
      toast.error(t('reports.saved.deleteFailed'));
      throw new Error(t('reports.saved.deleteFailed'));
    }
  };

  const exportCsv = () => {
    if (!report) {
      return;
    }
    const decimalComma = new Intl.NumberFormat(intlLocale).format(1.1).includes(',');
    const separator = decimalComma ? ';' : ',';
    const decimalSeparator = decimalComma ? ',' : '.';
    const rows: Array<Array<string>> = [
      [
        t('reports.export.section'),
        t('reports.export.period'),
        t('common.currency'),
        t('reports.export.group'),
        t('reports.summary.income'),
        t('reports.summary.expenses'),
        t('reports.breakdown.total'),
      ],
    ];
    for (const period of report.series) {
      for (const group of period.groups) {
        rows.push([
          t('reports.export.series'),
          period.period,
          period.currency,
          group.label,
          minorToDecimal(group.incomeMinor, period.currency, decimalSeparator),
          minorToDecimal(group.expensesMinor, period.currency, decimalSeparator),
          minorToDecimal(group.incomeMinor + group.expensesMinor, period.currency, decimalSeparator),
        ]);
      }
    }
    for (const group of report.breakdown) {
      rows.push([
        t('reports.export.breakdown'),
        '',
        group.currency,
        group.label,
        minorToDecimal(group.incomeMinor, group.currency, decimalSeparator),
        minorToDecimal(group.expensesMinor, group.currency, decimalSeparator),
        minorToDecimal(group.totalMinor, group.currency, decimalSeparator),
      ]);
    }
    const blob = new Blob([String.fromCharCode(0xfeff) + createCsv(rows, separator)], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `report-${tab}-${dateRange.dateFrom}-${dateRange.dateTo}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const chartControls =
    mode === 'trends'
      ? [
          { value: 'barGrouped' as const, label: t('reports.chart.grouped'), icon: Rows3Icon },
          { value: 'barStacked' as const, label: t('reports.chart.stacked'), icon: Layers3Icon },
        ]
      : tab === 'cashflow'
        ? [{ value: 'sankey' as const, label: t('reports.chart.sankey'), icon: GitBranchIcon }]
        : [
            { value: 'donut' as const, label: t('reports.chart.donut'), icon: ChartPieIcon },
            { value: 'hbar' as const, label: t('reports.chart.horizontal'), icon: BarChart3Icon },
          ];

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(value) => changeTab(value as ReportTab)}>
          <TabsList>
            <TabsTrigger value="cashflow">{t('reports.tabs.cashflow')}</TabsTrigger>
            <TabsTrigger value="spending">{t('reports.tabs.spending')}</TabsTrigger>
            <TabsTrigger value="income">{t('reports.tabs.income')}</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            value={mode}
            variant="outline"
            spacing={0}
            aria-label={t('reports.mode.label')}
            onValueChange={(value) => value && changeMode(value as ReportMode)}
          >
            <ToggleGroupItem value="breakdown">{t('reports.mode.breakdown')}</ToggleGroupItem>
            <ToggleGroupItem value="trends">{t('reports.mode.trends')}</ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup
            type="single"
            value={chartType}
            variant="outline"
            spacing={0}
            aria-label={t('reports.chart.label')}
            onValueChange={(value) => value && setChartType(value as ReportChartType)}
          >
            {chartControls.map(({ icon: Icon, label, value }) => (
              <ToggleGroupItem key={value} value={value} aria-label={label} title={label}>
                <Icon />
                <span className="hidden sm:inline">{label}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <SavedReportsMenu
            reports={tagsResult === undefined ? undefined : savedReports}
            onApply={applySavedReport}
            onSave={saveCurrentReport}
            onRename={renameSavedReport}
            onDelete={removeSavedReport}
          />
          <Button type="button" variant="outline" size="sm" disabled={!report} onClick={exportCsv}>
            <DownloadIcon data-icon="inline-start" />
            {t('reports.export.button')}
          </Button>
        </div>
      </div>

      <ReportFiltersBar
        accounts={accounts}
        categories={categories}
        filters={filters}
        onChange={setFilters}
        showGranularity={mode === 'trends'}
        tags={tags}
      />

      {!parsedFilters.valid ? (
        <Alert variant="destructive">
          <AlertTitle>{t('reports.invalid.title')}</AlertTitle>
          <AlertDescription>{t('reports.invalid.description')}</AlertDescription>
        </Alert>
      ) : null}
      {report?.truncated ? (
        <Alert>
          <AlertTitle>{t('reports.truncated.title')}</AlertTitle>
          <AlertDescription>{t('reports.truncated.description')}</AlertDescription>
        </Alert>
      ) : null}

      {parsedFilters.valid && report === undefined ? (
        <div className="grid gap-4">
          <StatRowSkeleton />
          <PanelSkeleton rows={4} />
        </div>
      ) : null}
      {report?.summary.length === 0 ? (
        <EmptyState
          icon={BarChart3Icon}
          title={t('reports.empty.title')}
          hint={t('reports.empty.description')}
        />
      ) : null}
      {report?.summary.map((summary) => {
        const breakdown = report.breakdown.filter((row) => row.currency === summary.currency);
        const series = report.series.filter((row) => row.currency === summary.currency);
        return (
          <section key={summary.currency} className="grid gap-4 md:gap-5">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold">{summary.currency}</h2>
              <div className="h-px flex-1 bg-border" />
            </div>
            <PanelErrorBoundary>
              <ReportSummaryCards summary={summary} />
            </PanelErrorBoundary>
            <PanelErrorBoundary>
              {mode === 'trends' ? (
                <ReportTrendsChart
                  currency={summary.currency}
                  data={series}
                  tab={tab}
                  variant={chartType === 'barStacked' ? 'barStacked' : 'barGrouped'}
                />
              ) : tab === 'cashflow' ? (
                <CashflowSankey
                  categories={categories}
                  currency={summary.currency}
                  data={breakdown}
                  groupBy={filters.groupBy}
                />
              ) : (
                <SpendingBreakdownChart
                  currency={summary.currency}
                  data={breakdown}
                  tab={tab}
                  variant={chartType === 'hbar' ? 'hbar' : 'donut'}
                  onSelect={openSegment}
                />
              )}
            </PanelErrorBoundary>
          </section>
        );
      })}

      <ReportTransactionsSheet
        categories={categories}
        hasMore={nextTransactionCursor !== null}
        loading={selection !== null && transactionPage === undefined}
        loadingMore={transactionRows.length > 0 && transactionPage === undefined}
        open={selection !== null}
        onOpenChange={closeTransactions}
        onLoadMore={() => nextTransactionCursor && setTransactionCursor(nextTransactionCursor)}
        rows={transactionRows}
        selection={selection}
      />
    </div>
  );
}
