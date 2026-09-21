import { getToolName } from 'ai';
import { useQuery } from 'convex/react';

import { api } from '../../../../convex/_generated/api';
import { ChartPart } from './chart-part';
import { TablePart } from './table-part';
import { ToolConfirmation } from './tool-confirmation';
import { hasToolExecutionError, isRecord } from './helpers';
import type { DynamicToolUIPart, ToolUIPart, UITools } from 'ai';
import type { TranslationKey } from '@/lib/i18n';
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from '@/components/ai-elements/tool';
import { Source, SourceDocument, Sources } from '@/components/ai-elements/sources';
import { useI18n } from '@/lib/i18n';

type AnyToolPart = ToolUIPart<UITools> | DynamicToolUIPart;

const toolKeys: Record<string, TranslationKey> = {
  getAccountsOverview: 'analyst.tool.accounts',
  listTransactions: 'analyst.tool.transactions',
  getSpendingByCategory: 'analyst.tool.spending',
  getPlanWithProgress: 'analyst.tool.plan',
  getCashflowProjection: 'analyst.tool.cashflow',
  getMoneyBoxes: 'analyst.tool.moneyBoxes',
  getCreditFacilities: 'analyst.tool.credit',
  getSubscriptions: 'analyst.tool.subscriptions',
  getPlannedItems: 'analyst.tool.plannedItems',
  webSearch: 'analyst.tool.webSearch',
  simulateWhatIf: 'analyst.tool.whatIf',
  presentChart: 'analyst.tool.chart',
  presentTable: 'analyst.tool.table',
  setPlanAssigned: 'analyst.tool.setPlanAssigned',
  setPlanTarget: 'analyst.tool.setPlanTarget',
  createMoneyBox: 'analyst.tool.createMoneyBox',
  createPlannedExpense: 'analyst.tool.createPlannedExpense',
  rememberFact: 'analyst.tool.rememberFact',
  optimizeMoneyBoxes: 'analyst.tool.optimizeMoneyBoxes',
  bulkRecategorize: 'analyst.tool.bulkRecategorize',
};

function SearchResultSources({ output }: { output: unknown }) {
  const { t } = useI18n();
  if (!isRecord(output) || !Array.isArray(output.sources)) return null;
  const sources = output.sources.filter(isRecord).map((source, index) => ({
    id: typeof source.url === 'string' ? source.url : `document-${index}`,
    url: typeof source.url === 'string' && /^https?:\/\//.test(source.url) ? source.url : undefined,
    title: typeof source.title === 'string' ? source.title : t('analyst.source.document'),
  }));
  return sources.length ? (
    <Sources label={t('analyst.sources')}>
      {sources.map((source) =>
        source.url ? (
          <Source key={source.id} href={source.url}>
            {source.title}
          </Source>
        ) : (
          <SourceDocument key={source.id}>{source.title}</SourceDocument>
        ),
      )}
    </Sources>
  ) : null;
}

export function ToolPart({
  part,
  threadId,
  approvalPending,
  onApproval,
}: {
  part: AnyToolPart;
  threadId?: string;
  approvalPending: boolean;
  onApproval: (approvalId: string, approve: boolean) => void;
}) {
  const { t } = useI18n();
  const name = getToolName(part);
  const label = t(toolKeys[name] ?? 'analyst.tool.activity');
  // UC5 badge lookup is best-effort: skip rules keep hooks unconditional,
  // and a missing badge renders no badge. Approval is always required.
  const badgeRow = useQuery(
    api.analyst.writeGuard.getBadgeForApproval,
    part.state === 'approval-requested' && threadId ? { threadId, approvalId: part.approval.id } : 'skip',
  );
  if (part.state === 'approval-requested') {
    return (
      <ToolConfirmation
        toolName={name}
        input={part.input}
        badge={badgeRow?.badge}
        disabled={approvalPending}
        onRespond={(approve) => onApproval(part.approval.id, approve)}
      />
    );
  }
  const hasError = hasToolExecutionError(part);
  if (!hasError && name === 'presentChart' && part.state === 'output-available')
    return <ChartPart output={part.output} />;
  if (!hasError && name === 'presentTable' && part.state === 'output-available')
    return <TablePart output={part.output} />;
  const status = hasError
    ? t('analyst.tool.status.error')
    : part.state === 'approval-responded'
      ? part.approval.approved
        ? t('analyst.tool.status.approved')
        : t('analyst.tool.status.denied')
      : part.state === 'output-denied'
        ? t('analyst.tool.status.denied')
        : part.state === 'output-error'
          ? t('analyst.tool.status.error')
          : part.state === 'output-available'
            ? t('analyst.tool.status.complete')
            : t('analyst.tool.status.running');
  return (
    <Tool defaultOpen={hasError}>
      <ToolHeader title={`${label} · ${status}`} state={hasError ? 'output-error' : part.state} />
      <ToolContent>
        <ToolInput input={part.input} />
        {part.state === 'output-available' && !hasError ? <ToolOutput output={part.output} /> : null}
        {hasError ? <p className="text-destructive">{t('analyst.tool.errorSafe')}</p> : null}
        {part.state === 'output-denied' ? <p className="text-muted-foreground">{t('analyst.tool.denied')}</p> : null}
        {part.state === 'approval-responded' ? <p className="text-muted-foreground">{status}</p> : null}
        {name === 'webSearch' && part.state === 'output-available' ? (
          <SearchResultSources output={part.output} />
        ) : null}
      </ToolContent>
    </Tool>
  );
}
