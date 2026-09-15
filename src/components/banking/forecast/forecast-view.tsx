import * as React from 'react';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { Settings2Icon, TriangleAlertIcon } from 'lucide-react';

import { api } from '../../../../convex/_generated/api';
import { AccountSettingsSheet } from './account-settings-sheet';
import { AssumptionsSidebar } from './assumptions-sidebar';
import { ForecastOnboarding } from './forecast-onboarding';
import { ForecastStatsBar } from './forecast-stats-bar';
import { LifeEventSheet } from './life-event-sheet';
import { NetWorthChart } from './net-worth-chart';
import { ScenarioBar } from './scenario-bar';
import { ScenarioSettingsDialog } from './scenario-settings-dialog';
import { TodaysEurosToggle } from './todays-euros-toggle';
import { YearTable } from './year-table';
import { retirementAgeFromEvents, targetKey } from './forecast-utils';
import type {
  AccountAssumptionDraft,
  EurosMode,
  ForecastAccountAssumption,
  ForecastIncomeSource,
  ForecastLifeEvent,
  IncomeSourceDraft,
  OnboardingDraft,
  ScenarioDraft,
  StoredForecastLifeEvent,
} from './forecast-utils';
import type { Id } from '../../../../convex/_generated/dataModel';
import { PanelSkeleton } from '@/components/app/skeletons';
import { UpgradeCta } from '@/components/app/upgrade-cta';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useEntitlements } from '@/lib/entitlements';
import { useI18n } from '@/lib/i18n';
import { parseMoneyMinor } from '@/lib/money';
import { usePendingAction } from '@/hooks/use-pending-action';

export function ForecastView({
  compareScenarioId,
  onSearchChange,
  selectedScenarioId,
}: {
  compareScenarioId?: string;
  onSearchChange: (scenario?: string, compare?: string) => void;
  selectedScenarioId?: string;
}) {
  const { intlLocale, t } = useI18n();
  const pendingAction = usePendingAction();
  const convex = useConvex();
  const entitlements = useEntitlements();
  const canUseForecast = entitlements?.features['forecast.scenarios'] === true;
  const scenarios = useQuery(api.forecast.scenarios.listScenarios, canUseForecast ? {} : 'skip');
  const sortedScenarios = React.useMemo(
    () => scenarios?.slice().sort((left, right) => left.sortOrder - right.sortOrder),
    [scenarios],
  );
  const activeScenario = React.useMemo(
    () => sortedScenarios?.find((scenario) => scenario._id === selectedScenarioId) ?? sortedScenarios?.[0],
    [selectedScenarioId, sortedScenarios],
  );
  const compareScenario = React.useMemo(
    () =>
      sortedScenarios?.find(
        (scenario) => scenario._id === compareScenarioId && scenario._id !== activeScenario?._id,
      ),
    [activeScenario?._id, compareScenarioId, sortedScenarios],
  );
  const projectionResult = useQuery(
    api.forecast.projection.getProjection,
    canUseForecast && activeScenario ? { scenarioId: activeScenario._id } : 'skip',
  );
  const compareProjectionResult = useQuery(
    api.forecast.projection.getProjection,
    canUseForecast && compareScenario ? { scenarioId: compareScenario._id } : 'skip',
  );
  const scenarioDetails = useQuery(
    api.forecast.scenarios.getScenario,
    canUseForecast && activeScenario ? { scenarioId: activeScenario._id } : 'skip',
  );
  const seeds = useQuery(api.forecast.seeds.getForecastSeeds, canUseForecast ? {} : 'skip');
  const accounts = useQuery(
    api.banking.accounts.listAccounts,
    canUseForecast ? { status: 'active', limit: 200 } : 'skip',
  );

  const initializeForecast = useMutation(api.forecast.scenarios.initializeForecast);
  const updateScenario = useMutation(api.forecast.scenarios.updateScenario);
  const duplicateScenario = useMutation(api.forecast.scenarios.duplicateScenario);
  const deleteScenario = useMutation(api.forecast.scenarios.deleteScenario);
  const reorderScenarios = useMutation(api.forecast.scenarios.reorderScenarios);
  const upsertAccountAssumption = useMutation(api.forecast.scenarios.upsertAccountAssumption);
  const upsertIncomeSource = useMutation(api.forecast.scenarios.upsertIncomeSource);
  const deleteIncomeSource = useMutation(api.forecast.scenarios.deleteIncomeSource);
  const upsertLifeEvent = useMutation(api.forecast.scenarios.upsertLifeEvent);
  const deleteLifeEvent = useMutation(api.forecast.scenarios.deleteLifeEvent);

  const [mode, setMode] = React.useState<EurosMode>('today');
  const [assumptionsOpen, setAssumptionsOpen] = React.useState(false);
  const [scenarioSettingsOpen, setScenarioSettingsOpen] = React.useState(false);
  const [eventSheetOpen, setEventSheetOpen] = React.useState(false);
  const [selectedEvent, setSelectedEvent] = React.useState<ForecastLifeEvent | null>(null);
  const [selectedAccount, setSelectedAccount] = React.useState<{
    assumption: ForecastAccountAssumption;
    label: string;
  } | null>(null);

  if (entitlements === undefined) return <PanelSkeleton rows={5} />;
  if (!canUseForecast) return <UpgradeCta />;
  if (scenarios === undefined || seeds === undefined || sortedScenarios === undefined) return <PanelSkeleton rows={5} />;

  const initialize = async (draft: OnboardingDraft) =>
    pendingAction.run(
      'initialize',
      async () => {
        const scenarioId = await initializeForecast({
          birthYear: draft.birthYear,
          defaultRetirementAge: draft.retirementAge,
          retirementAge: draft.retirementAge,
          includeAccountIds: draft.accounts.filter((account) => account.included).map((account) => account.accountId),
          incomeOverrides: draft.incomeSources.map((source) => ({
            name: source.name,
            amountMonthly: {
              amountMinor: parseMoneyMinor(source.amountMonthly, seeds.currency, intlLocale),
              currency: seeds.currency,
            },
            changeMode: source.changeMode,
            ...(source.changeMode === 'customPct' ? { customPct: source.customPct ?? 0 } : {}),
          })),
        });
        await Promise.all(
          draft.accounts.map((account) =>
            upsertAccountAssumption({
              scenarioId,
              target: { kind: 'account', accountId: account.accountId },
              included: account.included,
              growthAnnualPct: account.growthAnnualPct,
            }),
          ),
        );
        await updateScenario({
          scenarioId,
          livingExpenses: {
            amountMonthly: {
              amountMinor: parseMoneyMinor(draft.expensesAmount, seeds.currency, intlLocale),
              currency: seeds.currency,
            },
            changeMode: seeds.livingExpenses.changeMode,
          },
        });
        onSearchChange(scenarioId, undefined);
      },
      {
        success: t('forecast.onboarding.created'),
        error: t('forecast.onboarding.createFailed'),
      },
    );

  if (scenarios.length === 0) {
    return <ForecastOnboarding seeds={seeds} isPending={pendingAction.isPending('initialize')} onSubmit={initialize} />;
  }

  if (!activeScenario || projectionResult === undefined || scenarioDetails === undefined || accounts === undefined) {
    return <PanelSkeleton rows={5} />;
  }
  if ('upgradeRequired' in projectionResult) return <UpgradeCta />;
  if ('needsOnboarding' in projectionResult) {
    return <ForecastOnboarding seeds={seeds} isPending={pendingAction.isPending('initialize')} onSubmit={initialize} />;
  }

  const projection = projectionResult.projection;
  const scenario = scenarioDetails.scenario;
  const retirementAge = retirementAgeFromEvents(scenarioDetails.lifeEvents);
  const currentAge = new Date().getUTCFullYear() - projection.assumptions.birthYear;
  const compareProjection =
    compareProjectionResult &&
    !('upgradeRequired' in compareProjectionResult) &&
    !('needsOnboarding' in compareProjectionResult)
      ? compareProjectionResult.projection
      : undefined;

  const saveScenario = async (draft: ScenarioDraft) =>
    pendingAction.run(
      'scenario',
      async () => {
        await updateScenario({
          scenarioId: scenario._id,
          inflationAnnualPct: draft.inflationAnnualPct,
          endAge: draft.endAge,
          livingExpenses: {
            amountMonthly: {
              amountMinor: parseMoneyMinor(draft.livingExpensesAmount, scenario.currency, intlLocale),
              currency: scenario.currency,
            },
            changeMode: draft.livingExpensesChangeMode,
            ...(draft.livingExpensesChangeMode === 'customPct'
              ? { customPct: draft.livingExpensesCustomPct ?? 0 }
              : {}),
          },
          extraSavings: {
            growthAnnualPct: draft.extraSavingsGrowthAnnualPct,
            splits: scenario.extraSavings.splits,
          },
          capitalGainsTaxPct: draft.capitalGainsTaxPct,
        });
      },
      { success: t('forecast.assumptions.saved'), error: t('forecast.assumptions.saveFailed') },
    );

  const saveIncome = async (draft: IncomeSourceDraft) => {
    const key = draft.incomeSourceId ? `income:${draft.incomeSourceId}` : 'income:new';
    return pendingAction.run(
      key,
      async () => {
        await upsertIncomeSource({
          scenarioId: scenario._id,
          ...(draft.incomeSourceId ? { incomeSourceId: draft.incomeSourceId } : {}),
          name: draft.name,
          amountMonthly: {
            amountMinor: parseMoneyMinor(draft.amountMonthly, scenario.currency, intlLocale),
            currency: scenario.currency,
          },
          changeMode: draft.changeMode,
          ...(draft.changeMode === 'customPct' ? { customPct: draft.customPct ?? 0 } : {}),
          ...(draft.sortOrder === undefined ? {} : { sortOrder: draft.sortOrder }),
        });
      },
      { success: t('forecast.assumptions.incomeSaved'), error: t('forecast.assumptions.incomeSaveFailed') },
    );
  };

  const removeIncome = async (source: ForecastIncomeSource) =>
    pendingAction.run(
      `income:delete:${source._id}`,
      async () => {
        await deleteIncomeSource({ incomeSourceId: source._id });
      },
      { success: t('forecast.assumptions.incomeDeleted'), error: t('forecast.assumptions.incomeDeleteFailed') },
    );

  const saveAccount = async (draft: AccountAssumptionDraft) => {
    const key = `account:${draft.target.kind === 'account' ? draft.target.accountId : draft.target.creditFacilityId}`;
    return pendingAction.run(
      key,
      async () => {
        if (draft.target.kind === 'creditFacility') {
          await upsertAccountAssumption({
            scenarioId: scenario._id,
            target: draft.target,
            included: draft.included,
            liability: {
              includedInLivingExpenses: draft.includedInLivingExpenses ?? true,
              ...(draft.annualRatePct === undefined
                ? {}
                : { annualRateBps: Math.round(draft.annualRatePct * 100) }),
              ...(draft.paymentMonthly
                ? {
                    paymentMonthly: {
                      amountMinor: parseMoneyMinor(draft.paymentMonthly, scenario.currency, intlLocale),
                      currency: scenario.currency,
                    },
                  }
                : {}),
            },
          });
          return;
        }
        await upsertAccountAssumption({
          scenarioId: scenario._id,
          target: draft.target,
          included: draft.included,
          growthAnnualPct: draft.growthAnnualPct ?? 0,
          ...(draft.contributionYearly
            ? {
                contributionYearly: {
                  amountMinor: parseMoneyMinor(draft.contributionYearly, scenario.currency, intlLocale),
                  currency: scenario.currency,
                },
              }
            : {}),
        });
      },
      { success: t('forecast.account.saved'), error: t('forecast.account.saveFailed') },
    );
  };

  const saveLifeEvent = async (
    event: StoredForecastLifeEvent,
    enabled: boolean,
    eventId?: Id<'forecastLifeEvents'>,
  ) =>
    pendingAction.run(
      eventId ? `event:${eventId}` : 'event:new',
      async () => {
        await upsertLifeEvent({
          scenarioId: scenario._id,
          ...(eventId ? { lifeEventId: eventId } : {}),
          enabled,
          event,
        });
      },
      { success: t('forecast.events.saved'), error: t('forecast.events.saveFailed') },
    );

  const toggleLifeEvent = async (item: ForecastLifeEvent, enabled: boolean) =>
    pendingAction.run(
      `event:toggle:${item._id}`,
      async () => {
        await upsertLifeEvent({
          scenarioId: scenario._id,
          lifeEventId: item._id,
          enabled,
          event: item.event,
        });
      },
      { error: t('forecast.events.saveFailed') },
    );

  const removeLifeEvent = async (item: ForecastLifeEvent) =>
    pendingAction.run(
      `event:delete:${item._id}`,
      async () => {
        await deleteLifeEvent({ lifeEventId: item._id });
      },
      { success: t('forecast.events.deleted'), error: t('forecast.events.deleteFailed') },
    );

  const resetFreshScenario = async (scenarioId: Id<'forecastScenarios'>) => {
    const details = await convex.query(api.forecast.scenarios.getScenario, { scenarioId });
    const retirement = retirementAge ?? Math.max(currentAge, 67);
    const endAge = Math.min(120, Math.max(90, currentAge + 1, retirement + 20));
    await updateScenario({
      scenarioId,
      name: t('forecast.scenarios.freshName'),
      icon: '✦',
      color: 'var(--chart-2)',
      inflationAnnualPct: 3,
      endAge,
      livingExpenses: {
        amountMonthly: seeds.livingExpenses.amountMonthly,
        changeMode: seeds.livingExpenses.changeMode,
      },
      extraSavings: { growthAnnualPct: 3, splits: [] },
      capitalGainsTaxPct: 26,
    });

    const accountSeeds = new Map(seeds.accounts.map((item) => [item.accountId, item]));
    const liabilitySeeds = new Set(seeds.liabilities.map((item) => item.creditFacilityId));
    const existingTargets = new Set(details.accountAssumptions.map((item) => targetKey(item.target)));
    await Promise.all(
      details.accountAssumptions.map((assumption) => {
        if (assumption.target.kind === 'account') {
          const seed = accountSeeds.get(assumption.target.accountId);
          return upsertAccountAssumption({
            scenarioId,
            target: assumption.target,
            included: seed?.included ?? false,
            growthAnnualPct: seed?.growthAnnualPct ?? 0,
          });
        }
        return upsertAccountAssumption({
          scenarioId,
          target: assumption.target,
          included: liabilitySeeds.has(assumption.target.creditFacilityId),
          liability: { includedInLivingExpenses: true },
        });
      }),
    );
    await Promise.all(
      seeds.accounts
        .filter((seed) => !existingTargets.has(`account:${seed.accountId}`))
        .map((seed) =>
          upsertAccountAssumption({
            scenarioId,
            target: { kind: 'account', accountId: seed.accountId },
            included: seed.included,
            growthAnnualPct: seed.growthAnnualPct,
          }),
        ),
    );
    await Promise.all(
      seeds.liabilities
        .filter((seed) => !existingTargets.has(`facility:${seed.creditFacilityId}`))
        .map((seed) =>
          upsertAccountAssumption({
            scenarioId,
            target: { kind: 'creditFacility', creditFacilityId: seed.creditFacilityId },
            included: true,
            liability: { includedInLivingExpenses: true },
          }),
        ),
    );
    await Promise.all(details.incomeSources.map((source) => deleteIncomeSource({ incomeSourceId: source._id })));
    await Promise.all(details.lifeEvents.map((item) => deleteLifeEvent({ lifeEventId: item._id })));
    await upsertLifeEvent({
      scenarioId,
      enabled: true,
      event: {
        kind: 'retirement',
        age: retirement,
        expensePct: 80,
        incomeReductionPct: 100,
      },
    });
    await Promise.all(
      seeds.incomeSources.map((source, sortOrder) =>
        upsertIncomeSource({
          scenarioId,
          name: source.name,
          amountMonthly: source.amountMonthly,
          changeMode: source.changeMode,
          sortOrder,
        }),
      ),
    );
  };

  const createScenario = async (creationMode: 'duplicate' | 'fresh') => {
    let createdId: Id<'forecastScenarios'> | undefined;
    const ok = await pendingAction.run(
      `scenario:create:${creationMode}`,
      async () => {
        createdId = await duplicateScenario({
          scenarioId: scenario._id,
          ...(creationMode === 'fresh' ? { name: t('forecast.scenarios.freshName') } : {}),
        });
        if (creationMode === 'fresh') await resetFreshScenario(createdId);
      },
      {
        success: t(creationMode === 'fresh' ? 'forecast.scenarios.freshCreated' : 'forecast.scenarios.duplicated'),
        error: t('forecast.scenarios.createFailed'),
      },
    );
    if (ok && createdId) {
      setScenarioSettingsOpen(false);
      onSearchChange(createdId, undefined);
    }
  };

  const saveScenarioIdentity = async (values: { name: string; icon: string; color: string }) =>
    pendingAction.run(
      'scenario:identity',
      async () => {
        await updateScenario({ scenarioId: scenario._id, ...values });
      },
      { success: t('forecast.scenarios.saved'), error: t('forecast.scenarios.saveFailed') },
    );

  const moveScenario = async (direction: 'up' | 'down') => {
    const index = sortedScenarios.findIndex((item) => item._id === scenario._id);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= sortedScenarios.length) return;
    const orderedIds = sortedScenarios.map((item) => item._id);
    [orderedIds[index], orderedIds[targetIndex]] = [orderedIds[targetIndex], orderedIds[index]];
    await pendingAction.run(
      `scenario:move:${direction}`,
      async () => {
        await reorderScenarios({ orderedIds });
      },
      { error: t('forecast.scenarios.reorderFailed') },
    );
  };

  const removeScenario = async () => {
    const remaining = sortedScenarios.filter((item) => item._id !== scenario._id);
    const ok = await pendingAction.run(
      'scenario:delete',
      async () => {
        await deleteScenario({ scenarioId: scenario._id });
      },
      { success: t('forecast.scenarios.deleted'), error: t('forecast.scenarios.deleteFailed') },
    );
    if (ok) {
      setScenarioSettingsOpen(false);
      onSearchChange(remaining[0]?._id, undefined);
    }
    return ok;
  };

  const resetForecast = async () => {
    const ok = await pendingAction.run(
      'reset',
      async () => {
        for (const item of sortedScenarios) await deleteScenario({ scenarioId: item._id });
      },
      { success: t('forecast.reset.done'), error: t('forecast.reset.failed') },
    );
    if (ok) {
      setAssumptionsOpen(false);
      onSearchChange(undefined, undefined);
    }
    return ok;
  };

  const excludedCount = projectionResult.excludedAccounts.length + projectionResult.excludedFacilities.length;
  const facilities = seeds.liabilities.map((liability) => ({
    creditFacilityId: liability.creditFacilityId,
    name: liability.name,
  }));
  const activeIndex = sortedScenarios.findIndex((item) => item._id === scenario._id);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <ScenarioBar
        scenarios={sortedScenarios}
        activeId={scenario._id}
        compareId={compareScenario?._id}
        isPending={pendingAction.isPending()}
        onSelect={(scenarioId) => onSearchChange(scenarioId, compareScenario?._id === scenarioId ? undefined : compareScenario?._id)}
        onCompareChange={(scenarioId) => onSearchChange(scenario._id, scenarioId)}
        onCreate={(creationMode) => void createScenario(creationMode)}
        onOpenSettings={() => setScenarioSettingsOpen(true)}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <TodaysEurosToggle mode={mode} onChange={setMode} />
        <Button type="button" variant="outline" size="sm" onClick={() => setAssumptionsOpen(true)}>
          <Settings2Icon data-icon="inline-start" />
          {t('forecast.assumptions.edit')}
        </Button>
      </div>

      {excludedCount > 0 ? (
        <Alert>
          <TriangleAlertIcon />
          <AlertTitle>{t('forecast.excluded.title')}</AlertTitle>
          <AlertDescription>{t('forecast.excluded.description', { count: excludedCount })}</AlertDescription>
        </Alert>
      ) : null}

      {projectionResult.invalidEvents.length > 0 ? (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>{t('forecast.events.invalidTitle')}</AlertTitle>
          <AlertDescription>
            <p>{t('forecast.events.invalidDescription', { count: projectionResult.invalidEvents.length })}</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {projectionResult.invalidEvents.map((item) => (
                <li key={item.eventId}>{item.reason}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <ForecastStatsBar
        mode={mode}
        projection={projection}
        retirementAge={retirementAge}
        compareProjection={compareProjection}
        compareName={compareScenario?.name}
      />
      <NetWorthChart
        mode={mode}
        projection={projection}
        primaryName={scenario.name}
        compareProjection={compareProjection}
        compareName={compareScenario?.name}
      />
      <YearTable
        accounts={accounts}
        assumptions={scenarioDetails.accountAssumptions}
        facilities={facilities}
        invalidEvents={projectionResult.invalidEvents}
        isPending={pendingAction.isPending}
        lifeEvents={scenarioDetails.lifeEvents}
        mode={mode}
        projection={projection}
        onAddEvent={() => {
          setSelectedEvent(null);
          setEventSheetOpen(true);
        }}
        onDeleteEvent={removeLifeEvent}
        onEditAccount={(assumption, label) => setSelectedAccount({ assumption, label })}
        onEditEvent={(item) => {
          setSelectedEvent(item);
          setEventSheetOpen(true);
        }}
        onToggleEvent={toggleLifeEvent}
      />

      <AssumptionsSidebar
        open={assumptionsOpen}
        onOpenChange={setAssumptionsOpen}
        scenario={scenario}
        incomeSources={scenarioDetails.incomeSources}
        isPending={pendingAction.isPending}
        onSaveScenario={saveScenario}
        onSaveIncome={saveIncome}
        onDeleteIncome={removeIncome}
        onReset={resetForecast}
      />
      <AccountSettingsSheet
        open={selectedAccount !== null}
        onOpenChange={(open) => !open && setSelectedAccount(null)}
        assumption={selectedAccount?.assumption ?? null}
        label={selectedAccount?.label ?? ''}
        currency={scenario.currency}
        isPending={
          selectedAccount
            ? pendingAction.isPending(
                `account:${
                  selectedAccount.assumption.target.kind === 'account'
                    ? selectedAccount.assumption.target.accountId
                    : selectedAccount.assumption.target.creditFacilityId
                }`,
              )
            : false
        }
        onSave={saveAccount}
      />
      <LifeEventSheet
        open={eventSheetOpen}
        onOpenChange={(open) => {
          setEventSheetOpen(open);
          if (!open) setSelectedEvent(null);
        }}
        event={selectedEvent}
        currency={scenario.currency}
        currentAge={currentAge}
        isPending={pendingAction.isPending(selectedEvent ? `event:${selectedEvent._id}` : 'event:new')}
        onSave={saveLifeEvent}
      />
      <ScenarioSettingsDialog
        open={scenarioSettingsOpen}
        onOpenChange={setScenarioSettingsOpen}
        scenario={scenario}
        canMoveUp={activeIndex > 0}
        canMoveDown={activeIndex >= 0 && activeIndex < sortedScenarios.length - 1}
        isPending={pendingAction.isPending()}
        onCreate={(creationMode) => void createScenario(creationMode)}
        onDelete={removeScenario}
        onMove={(direction) => void moveScenario(direction)}
        onSave={saveScenarioIdentity}
      />
    </div>
  );
}
