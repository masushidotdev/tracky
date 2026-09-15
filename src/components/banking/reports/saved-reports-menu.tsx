import * as React from 'react';
import { BookMarkedIcon, BookmarkPlusIcon, PencilIcon, Trash2Icon } from 'lucide-react';

import type { Id } from '../../../../convex/_generated/dataModel';
import type { SavedReport, SavedReportConfig } from './types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';

type NameDialogState =
  | { kind: 'save'; name: string }
  | { kind: 'rename'; report: SavedReport; name: string }
  | null;

export function SavedReportsMenu({
  onApply,
  onDelete,
  onRename,
  onSave,
  reports,
}: {
  onApply: (config: SavedReportConfig) => void;
  onDelete: (id: Id<'savedReports'>) => Promise<void>;
  onRename: (id: Id<'savedReports'>, name: string) => Promise<void>;
  onSave: (name: string) => Promise<void>;
  reports: Array<SavedReport> | undefined;
}) {
  const { t } = useI18n();
  const [nameDialog, setNameDialog] = React.useState<NameDialogState>(null);
  const [deleteReport, setDeleteReport] = React.useState<SavedReport | null>(null);
  const [pending, setPending] = React.useState(false);

  const submitName = async () => {
    if (!nameDialog?.name.trim()) {
      return;
    }
    setPending(true);
    try {
      if (nameDialog.kind === 'save') {
        await onSave(nameDialog.name);
      } else {
        await onRename(nameDialog.report._id, nameDialog.name);
      }
      setNameDialog(null);
    } catch {
      // The container reports the mutation error and keeps the dialog open for retry.
    } finally {
      setPending(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteReport) {
      return;
    }
    setPending(true);
    try {
      await onDelete(deleteReport._id);
      setDeleteReport(null);
    } catch {
      // The container reports the mutation error and keeps the confirmation open.
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            <BookMarkedIcon data-icon="inline-start" />
            {t('reports.saved.title')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem onSelect={() => setNameDialog({ kind: 'save', name: '' })}>
            <BookmarkPlusIcon />
            {t('reports.saved.saveCurrent')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>{t('reports.saved.savedReports')}</DropdownMenuLabel>
          {reports === undefined ? (
            <DropdownMenuItem disabled>{t('common.loading')}</DropdownMenuItem>
          ) : reports.length === 0 ? (
            <DropdownMenuItem disabled>{t('reports.saved.empty')}</DropdownMenuItem>
          ) : (
            reports.map((report) => (
              <DropdownMenuItem key={report._id} onSelect={() => onApply(report.config)}>
                <span className="truncate">{report.name}</span>
              </DropdownMenuItem>
            ))
          )}
          {reports && reports.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <PencilIcon />
                  {t('reports.saved.rename')}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-56">
                  {reports.map((report) => (
                    <DropdownMenuItem
                      key={report._id}
                      onSelect={() => setNameDialog({ kind: 'rename', report, name: report.name })}
                    >
                      <span className="truncate">{report.name}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="text-destructive">
                  <Trash2Icon />
                  {t('reports.saved.delete')}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-56">
                  {reports.map((report) => (
                    <DropdownMenuItem key={report._id} variant="destructive" onSelect={() => setDeleteReport(report)}>
                      <span className="truncate">{report.name}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={nameDialog !== null} onOpenChange={(open) => !open && setNameDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {nameDialog?.kind === 'rename' ? t('reports.saved.renameTitle') : t('reports.saved.saveTitle')}
            </DialogTitle>
            <DialogDescription>{t('reports.saved.nameDescription')}</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="savedReportName">{t('common.name')}</FieldLabel>
            <Input
              id="savedReportName"
              autoFocus
              maxLength={60}
              value={nameDialog?.name ?? ''}
              placeholder={t('reports.saved.namePlaceholder')}
              onChange={(event) =>
                setNameDialog((current) => (current ? { ...current, name: event.target.value } : current))
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void submitName();
                }
              }}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNameDialog(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" disabled={pending || !nameDialog?.name.trim()} onClick={() => void submitName()}>
              {pending ? t('common.loading') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteReport !== null} onOpenChange={(open) => !open && setDeleteReport(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('reports.saved.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('reports.saved.deleteDescription', { name: deleteReport?.name ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={() => void confirmDelete()}>
              {pending ? t('common.loading') : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
