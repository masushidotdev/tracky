import * as React from 'react';
import { useAction } from 'convex/react';
import { toast } from 'sonner';

import { api } from '../../../convex/_generated/api';
import type { I18nContextValue } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n';
import { EmptyState } from '@/components/app/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { usePendingAction } from '@/hooks/use-pending-action';
import { analyticsEvents, trackEvent } from '@/lib/analytics/events';
import { cn } from '@/lib/utils';

type AspspOption = {
  id: string;
  name: string;
  country: string;
  bic: string | null;
  logo: string | null;
  beta: boolean;
  psuTypes: Array<string>;
  maximumConsentDays: number | null;
  requiredPsuHeaders: Array<string>;
  services: Array<string>;
};
type ProviderDiagnostic = {
  ok: boolean;
  status: 'ok' | 'misconfigured' | 'inactive' | 'countryUnsupported' | 'unavailable';
  applicationName: string | null;
  environment: string | null;
  active: boolean | null;
  services: Array<string>;
  country: string;
  applicationCountries: Array<string>;
  aspspCount: number | null;
  checkedAtMs: number;
  message: string | null;
};

export function ConnectBankForm() {
  const { locale, t } = useI18n();
  const listAspsps = useAction(api.banking.enableBanking.listAspsps);
  const startConnection = useAction(api.banking.enableBanking.startConnection);
  const diagnoseConnection = useAction(api.banking.enableBanking.diagnoseConnection);
  const [bankSearch, setBankSearch] = React.useState('');
  const [aspspCountry, setAspspCountry] = React.useState('IT');
  const [psuType, setPsuType] = React.useState<'personal' | 'business'>('personal');
  const [validDays, setValidDays] = React.useState(180);
  const [aspsps, setAspsps] = React.useState<Array<AspspOption>>([]);
  const [selectedAspspId, setSelectedAspspId] = React.useState<string | null>(null);
  const [banksError, setBanksError] = React.useState<string | null>(null);
  const [diagnostic, setDiagnostic] = React.useState<ProviderDiagnostic | null>(null);
  const { isPending: isDiagnosticPending, run: runDiagnostic } = usePendingAction();
  const { isPending: isBanksPending, run: runBanks } = usePendingAction();
  const { isPending: isSubmitPending, run: runSubmit } = usePendingAction();
  const requestIdRef = React.useRef(0);
  const isCheckingDiagnostic = isDiagnosticPending('connect-diagnostic');
  const isLoadingBanks = isBanksPending('connect-banks');
  const isSubmitting = isSubmitPending('connect-submit');

  const selectedAspsp = React.useMemo(
    () => aspsps.find((aspsp) => aspsp.id === selectedAspspId) ?? null,
    [aspsps, selectedAspspId],
  );
  const diagnosticReadyForSelection = Boolean(
    selectedAspsp && diagnostic?.ok && diagnostic.country === selectedAspsp.country,
  );
  const consentBlockedMessage = selectedAspsp
    ? isCheckingDiagnostic || !diagnostic || diagnostic.country !== selectedAspsp.country
      ? t('connect.diagnostic.checking')
      : diagnostic.ok
        ? null
        : diagnostic.message || t('connect.diagnostic.blocked')
    : null;

  const checkDiagnostic = React.useCallback(async () => {
    const country = aspspCountry.trim().toUpperCase();
    if (country.length !== 2) {
      setDiagnostic(null);
      return;
    }

    let diagnosticErrorMessage = t('connect.diagnostic.unavailable');
    const checked = await runDiagnostic(
      'connect-diagnostic',
      async () => {
        try {
          const result = await diagnoseConnection({
            country,
            psuType,
          });
          setDiagnostic(result);
        } catch (error) {
          diagnosticErrorMessage = error instanceof Error ? error.message : t('connect.diagnostic.unavailable');
          throw error;
        }
      },
      {
        error: t('connect.diagnostic.unavailable'),
      },
    );

    if (!checked) {
      setDiagnostic({
        ok: false,
        status: 'unavailable',
        applicationName: null,
        environment: null,
        active: null,
        services: [],
        country,
        applicationCountries: [],
        aspspCount: null,
        checkedAtMs: Date.now(),
        message: diagnosticErrorMessage,
      });
    }
  }, [aspspCountry, diagnoseConnection, psuType, runDiagnostic, t]);

  const loadBanks = React.useCallback(async () => {
    const country = aspspCountry.trim().toUpperCase();
    if (country.length !== 2) {
      setAspsps([]);
      setSelectedAspspId(null);
      setBanksError(null);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setBanksError(null);

    let banksErrorMessage = t('connect.banksErrorFallback');
    const loaded = await runBanks(
      'connect-banks',
      async () => {
        try {
          const result = await listAspsps({
            country,
            psuType,
            service: 'AIS',
            search: bankSearch.trim() || undefined,
            limit: 30,
          });
          if (requestIdRef.current !== requestId) {
            return;
          }
          setAspsps(result.aspsps);
          setSelectedAspspId((current) => {
            if (current && result.aspsps.some((aspsp) => aspsp.id === current)) {
              return current;
            }
            return result.aspsps.length === 1 ? result.aspsps[0].id : null;
          });
        } catch (error) {
          banksErrorMessage = error instanceof Error ? error.message : t('connect.banksErrorFallback');
          throw error;
        }
      },
      {
        error: t('connect.banksErrorFallback'),
      },
    );

    if (!loaded) {
      if (requestIdRef.current !== requestId) {
        return;
      }
      setAspsps([]);
      setSelectedAspspId(null);
      setBanksError(banksErrorMessage);
    }
  }, [aspspCountry, bankSearch, listAspsps, psuType, runBanks, t]);

  React.useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadBanks();
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [loadBanks]);

  React.useEffect(() => {
    void checkDiagnostic();
  }, [checkDiagnostic]);

  function selectAspsp(aspsp: AspspOption) {
    setSelectedAspspId(aspsp.id);
    if (aspsp.maximumConsentDays !== null) {
      setValidDays(Math.min(Math.max(aspsp.maximumConsentDays, 1), 180));
    }
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAspsp) {
      toast.error(t('connect.selectBankFirst'));
      return;
    }
    if (!diagnosticReadyForSelection) {
      toast.error(consentBlockedMessage || t('connect.diagnostic.blocked'));
      return;
    }

    void runSubmit(
      'connect-submit',
      async () => {
        // provider_slug would leak the bank; country + psu type are enough for funnel analysis.
        // sendBeacon: the bank redirect unloads the page before XHR flushes.
        trackEvent(
          analyticsEvents.bankConnectionStarted,
          {
            country: selectedAspsp.country,
            psu_type: psuType,
            surface: 'bank-connections',
          },
          { sendBeacon: true },
        );
        const result = await startConnection({
          aspspName: selectedAspsp.name,
          aspspCountry: selectedAspsp.country,
          psuType,
          validDays,
          language: locale,
        });
        window.location.assign(result.url);
      },
      {
        error: t('connect.startFailed'),
      },
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <FieldGroup>
        <ProviderDiagnosticPanel
          diagnostic={diagnostic}
          isChecking={isCheckingDiagnostic}
          onRefresh={() => void checkDiagnostic()}
          t={t}
        />
        <div className="grid gap-3 md:grid-cols-[1fr_160px_180px]">
          <Field>
            <FieldLabel htmlFor="bankSearch">{t('connect.bank')}</FieldLabel>
            <Input
              id="bankSearch"
              value={bankSearch}
              onChange={(event) => {
                setBankSearch(event.target.value);
                setSelectedAspspId(null);
              }}
              placeholder={t('connect.bankSearchPlaceholder')}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="aspspCountry">{t('connect.country')}</FieldLabel>
            <Input
              id="aspspCountry"
              value={aspspCountry}
              onChange={(event) => {
                setAspspCountry(event.target.value.toUpperCase());
                setSelectedAspspId(null);
              }}
              maxLength={2}
            />
          </Field>
          <Field>
            <FieldLabel>{t('connect.psuType')}</FieldLabel>
            <Select value={psuType} onValueChange={(value) => setPsuType(value as 'personal' | 'business')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="personal">{t('connect.personal')}</SelectItem>
                  <SelectItem value="business">{t('connect.business')}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="rounded-md border bg-muted/20">
          <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
            <div>
              <p className="text-sm font-medium">{t('connect.availableBanks')}</p>
              <p className="text-xs text-muted-foreground">
                {isLoadingBanks ? t('connect.loadingBanks') : t('connect.availableBanksDescription')}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isLoadingBanks}
              onClick={() => void loadBanks()}
            >
              {isLoadingBanks ? <Spinner data-icon="inline-start" /> : null}
              {t('common.refresh')}
            </Button>
          </div>
          {banksError ? (
            <div className="px-3 py-4 text-sm text-destructive">{banksError}</div>
          ) : aspsps.length === 0 && !isLoadingBanks ? (
            <EmptyState className="p-4" title={t('connect.noBanks')} />
          ) : (
            <div className="max-h-72 divide-y overflow-y-auto">
              {aspsps.map((aspsp) => {
                const isSelected = aspsp.id === selectedAspspId;
                return (
                  <button
                    key={aspsp.id}
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-muted',
                      isSelected ? 'bg-muted' : undefined,
                    )}
                    onClick={() => selectAspsp(aspsp)}
                  >
                    {aspsp.logo ? (
                      <img
                        src={aspsp.logo}
                        alt=""
                        className="size-9 rounded-sm border bg-background object-contain"
                        loading="lazy"
                      />
                    ) : (
                      <span className="flex size-9 items-center justify-center rounded-sm border bg-background text-xs font-medium">
                        {aspsp.name.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{aspsp.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {aspsp.country}
                        {aspsp.bic ? ` - ${aspsp.bic}` : ''}
                        {aspsp.maximumConsentDays
                          ? ` - ${t('connect.maxConsentDays', {
                              days: aspsp.maximumConsentDays,
                            })}`
                          : ''}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-wrap justify-end gap-1">
                      {aspsp.beta && <Badge variant="secondary">{t('connect.beta')}</Badge>}
                      {isSelected && <Badge>{t('connect.selected')}</Badge>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_180px]">
          <Field>
            <FieldLabel>{t('connect.selectedBank')}</FieldLabel>
            <div className="rounded-md bg-muted px-3 py-2 text-sm">
              {selectedAspsp ? `${selectedAspsp.name} (${selectedAspsp.country})` : t('connect.noBankSelected')}
            </div>
          </Field>
          <Field>
            <FieldLabel htmlFor="validDays">{t('connect.consentDays')}</FieldLabel>
            <Input
              id="validDays"
              type="number"
              min={1}
              max={180}
              value={validDays}
              onChange={(event) => setValidDays(event.target.value ? Number(event.target.value) : 180)}
            />
          </Field>
        </div>
        <div className="flex flex-col gap-2">
          <Button type="submit" disabled={isSubmitting || !selectedAspsp || !diagnosticReadyForSelection}>
            {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
            {isSubmitting ? t('connect.starting') : t('connect.startConsent')}
          </Button>
          {consentBlockedMessage && <p className="text-xs text-muted-foreground">{consentBlockedMessage}</p>}
        </div>
      </FieldGroup>
    </form>
  );
}

function ProviderDiagnosticPanel({
  diagnostic,
  isChecking,
  onRefresh,
  t,
}: Readonly<{
  diagnostic: ProviderDiagnostic | null;
  isChecking: boolean;
  onRefresh: () => void;
  t: I18nContextValue['t'];
}>) {
  // A null message with !ok means the provider is not configured on this
  // instance: show the generic unavailable label instead of a raw error.
  const details = diagnostic?.ok
    ? t('connect.diagnostic.details', {
        environment: diagnostic.environment ?? '-',
        services: diagnostic.services.join(', ') || '-',
        count: diagnostic.aspspCount ?? 0,
        country: diagnostic.country,
      })
    : (diagnostic?.message ?? (diagnostic ? t('connect.diagnostic.unavailable') : t('connect.diagnostic.pending')));

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium">{t('connect.diagnostic.title')}</p>
        <p className={cn('text-xs', diagnostic?.ok ? 'text-muted-foreground' : 'text-destructive')}>{details}</p>
        {diagnostic?.ok && (
          <p className="mt-1 text-xs text-muted-foreground">{t('connect.diagnostic.restrictedNote')}</p>
        )}
      </div>
      <Button type="button" variant="outline" size="sm" disabled={isChecking} onClick={onRefresh}>
        {isChecking ? <Spinner data-icon="inline-start" /> : null}
        {isChecking ? t('connect.diagnostic.checking') : t('connect.diagnostic.refresh')}
      </Button>
    </div>
  );
}
