import * as React from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useAuth } from '@workos/authkit-tanstack-react-start/client';
import { useMutation, useQuery } from 'convex/react';
import { DownloadIcon, TriangleAlertIcon } from 'lucide-react';
import { toast } from 'sonner';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type { DeletionReason } from '@/lib/account-deletion-survey';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { analyticsEvents, trackEvent } from '@/lib/analytics/events';
import { deletionPendingKey } from '@/lib/account-deletion-pending';
import { deletionReasons } from '@/lib/account-deletion-survey';
import { useI18n } from '@/lib/i18n';

const deletionExportKey = 'tracky.deletionExportId';

export function DangerZoneCard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const exports = useQuery(api.dataExport.listMyDataExports, {});
  const requestExport = useMutation(api.dataExport.requestDeletionDataExport);
  const acknowledgeDownload = useMutation(api.dataExport.acknowledgeDeletionExportDownload);
  const [open, setOpen] = React.useState(false);
  const [typedEmail, setTypedEmail] = React.useState('');
  const [surveyStep, setSurveyStep] = React.useState(true);
  const [reason, setReason] = React.useState<DeletionReason | ''>('');
  const [otherText, setOtherText] = React.useState('');
  const [exportId, setExportId] = React.useState<Id<'dataExports'> | null>(null);
  const [requestingExport, setRequestingExport] = React.useState(false);
  const [downloadStarted, setDownloadStarted] = React.useState(false);
  const [acknowledgingExport, setAcknowledgingExport] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => {
    setExportId(window.sessionStorage.getItem(deletionExportKey) as Id<'dataExports'> | null);
  }, []);

  const selectedExportId = exports
    ? (exports.find((item) => item.deletionSelected)?._id ??
      exports.find((item) => item._id === exportId)?._id ?? null)
    : exportId;
  const exportForDeletion = exports?.find((item) => item._id === selectedExportId);
  const activeExport = exports?.find((item) => item.status === 'queued' || item.status === 'running');
  const readyExport = exportForDeletion
    ? (exportForDeletion.downloadUrl ? exportForDeletion : null)
    : exports?.find((item) => item.status === 'completed' && item.downloadUrl);
  const exportNeedsDownload = Boolean(selectedExportId &&
    (!exportForDeletion || (exportForDeletion.status !== 'failed' && !exportForDeletion.deletionDownloadAcknowledgedAtMs)));
  const email = user?.email ?? '';
  const validFeedback = reason !== '' && (reason !== 'other' || (otherText.trim().length > 0 && otherText.trim().length <= 500));
  const canDelete = !surveyStep && validFeedback && typedEmail.trim() === email && email !== '' && Boolean(user?.id) && Boolean(exports) && !exportNeedsDownload && !activeExport && !requestingExport && !acknowledgingExport && !deleting;

  const startExport = async () => {
    setRequestingExport(true);
    try {
      const id = await requestExport({});
      window.sessionStorage.setItem(deletionExportKey, id);
      setExportId(id);
      setDownloadStarted(false);
      trackEvent(analyticsEvents.dataExportRequested, {});
      toast.success(t('settings.danger.exportRequested'));
    } catch {
      toast.error(t('settings.danger.exportFailed'));
    } finally {
      setRequestingExport(false);
    }
  };

  const confirmDownload = async () => {
    if (!selectedExportId || !downloadStarted) return;
    setAcknowledgingExport(true);
    try {
      await acknowledgeDownload({ exportId: selectedExportId });
    } catch {
      toast.error(t('settings.danger.exportAckFailed'));
    } finally {
      setAcknowledgingExport(false);
    }
  };

  const confirm = async () => {
    if (!canDelete || !user?.id) return;
    setDeleting(true);
    // Leave the normal app before creating the deletion row. Its subscriptions
    // are intentionally rejected as soon as erasure starts.
    try {
      window.sessionStorage.setItem(deletionPendingKey, JSON.stringify({
        userId: user.id,
        deletionExportId: selectedExportId,
        feedback: reason === 'other' ? { reason, otherText: otherText.trim() } : { reason },
      }));
    } catch {
      toast.error(t('settings.danger.deleteFailed'));
      setDeleting(false);
      return;
    }
    try {
      await navigate({ to: '/app/settings/deleting', replace: true });
    } catch {
      try {
        window.sessionStorage.removeItem(deletionPendingKey);
        toast.error(t('settings.danger.deleteFailed'));
      } catch {
        // Keep the saved request; it can resume when browser storage recovers.
      }
      setDeleting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.danger.title')}</CardTitle>
        <CardDescription>{t('settings.danger.description')}</CardDescription>
        <CardAction>
          <AlertDialog open={open} onOpenChange={(next) => {
            setOpen(next);
            if (!next) {
              setTypedEmail('');
              setSurveyStep(true);
              setReason('');
              setOtherText('');
            }
          }}>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="destructive" size="sm" disabled={!email || deleting}>
                {t('settings.danger.request')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
              <AlertDialogHeader>
                <AlertDialogMedia><TriangleAlertIcon /></AlertDialogMedia>
                <AlertDialogTitle>{t(surveyStep ? 'settings.danger.surveyTitle' : 'settings.danger.confirmTitle')}</AlertDialogTitle>
                <AlertDialogDescription>{t(surveyStep ? 'settings.danger.surveyDescription' : 'settings.danger.confirmDescription')}</AlertDialogDescription>
              </AlertDialogHeader>
              {surveyStep ? (
                <div className="space-y-4">
                  <RadioGroup value={reason} onValueChange={(value) => setReason(value as DeletionReason)} aria-label={t('settings.danger.surveyTitle')}>
                    {deletionReasons.map((option) => (
                      <div key={option} className="flex items-center gap-3 rounded-xl border px-3 py-2">
                        <RadioGroupItem value={option} id={`deletion-reason-${option}`} disabled={deleting} />
                        <label htmlFor={`deletion-reason-${option}`} className="flex-1 cursor-pointer text-sm">
                          {t(`settings.danger.reason.${option}`)}
                        </label>
                      </div>
                    ))}
                  </RadioGroup>
                  {reason === 'other' ? (
                    <div className="space-y-2">
                      <label htmlFor="deletion-reason-other-text" className="text-sm font-medium">{t('settings.danger.otherLabel')}</label>
                      <Textarea id="deletion-reason-other-text" rows={3} maxLength={500} value={otherText}
                        onChange={(event) => setOtherText(event.target.value)} data-ph-mask required />
                    </div>
                  ) : null}
                  <p className="text-xs text-muted-foreground">{t('settings.danger.surveyPrivacy')}</p>
                </div>
              ) : <div className="space-y-4">
                <div className="space-y-2 rounded-2xl border p-3">
                  <p className="text-sm text-muted-foreground">{t('settings.danger.exportHint')}</p>
                  {activeExport || requestingExport ? (
                    <p className="flex items-center gap-2 text-sm" role="status">
                      <Spinner /> {t('settings.danger.exportInProgress')}
                    </p>
                  ) : readyExport?.downloadUrl ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button asChild type="button" size="sm" variant="outline">
                        <a href={readyExport.downloadUrl} download target="_blank" rel="noreferrer" onClick={() => setDownloadStarted(true)}>
                          <DownloadIcon data-icon="inline-start" /> {t('settings.danger.downloadExport')}
                        </a>
                      </Button>
                      {selectedExportId && readyExport._id === selectedExportId && downloadStarted &&
                        !exportForDeletion?.deletionDownloadAcknowledgedAtMs ? (
                        <Button type="button" size="sm" variant="outline" disabled={acknowledgingExport} onClick={() => void confirmDownload()}>
                          {acknowledgingExport ? <Spinner /> : null}{t('settings.danger.confirmDownload')}
                        </Button>
                      ) : null}
                    </div>
                  ) : (
                    <Button type="button" size="sm" variant="outline" onClick={() => void startExport()}>
                      {t('settings.danger.prepareExport')}
                    </Button>
                  )}
                  {exportForDeletion?.status === 'failed' ? (
                    <p className="text-sm text-destructive">{t('settings.danger.exportFailed')}</p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <label htmlFor="confirm-account-email" className="text-sm font-medium">
                    {t('settings.danger.typeEmail', { email })}
                  </label>
                  <Input
                    id="confirm-account-email"
                    type="email"
                    autoComplete="off"
                    spellCheck={false}
                    value={typedEmail}
                    onChange={(event) => setTypedEmail(event.target.value)}
                    disabled={deleting}
                  />
                </div>
              </div>}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>{t('settings.cancel')}</AlertDialogCancel>
                {surveyStep ? (
                  <Button type="button" disabled={!validFeedback} onClick={() => setSurveyStep(false)}>
                    {t('settings.danger.surveyNext')}
                  </Button>
                ) : (
                  <>
                    <Button type="button" variant="outline" disabled={deleting} onClick={() => setSurveyStep(true)}>{t('settings.danger.surveyBack')}</Button>
                    <Button type="button" variant="destructive" disabled={!canDelete} onClick={() => void confirm()}>
                      {deleting ? <Spinner /> : null}{t('settings.danger.confirm')}
                    </Button>
                  </>
                )}
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{t('settings.danger.noUndo')}</p>
      </CardContent>
    </Card>
  );
}
