import * as React from 'react';
import { CheckIcon, ChevronsUpDownIcon, LockIcon } from 'lucide-react';

import type { Id } from '../../../../convex/_generated/dataModel';
import type { PlanSummary } from './types';
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
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';

export function PlanSwitcher({
  activePlanId,
  canCreatePlan,
  name,
  onCreatePlan,
  onDeletePlan,
  onEditAccounts,
  onRenamePlan,
  onRestartPlan,
  onSelectPlan,
  pending,
  restartPending,
  plans,
}: {
  activePlanId: Id<'plans'>;
  canCreatePlan: boolean;
  name: string;
  onCreatePlan: () => void;
  onDeletePlan: (planId: Id<'plans'>) => Promise<boolean>;
  onEditAccounts: () => void;
  onRenamePlan: (planId: Id<'plans'>, name: string) => Promise<boolean>;
  onRestartPlan: (startDate: string) => Promise<boolean>;
  onSelectPlan: (planId: Id<'plans'>) => void;
  pending: boolean;
  restartPending: boolean;
  plans: Array<PlanSummary>;
}) {
  const { t } = useI18n();
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState(name);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [restartOpen, setRestartOpen] = React.useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [restartDate, setRestartDate] = React.useState(today);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="min-w-0 gap-1.5 px-2 font-heading text-lg font-medium"
            aria-label={t('plan.switcher.open')}
          >
            <span className="min-w-0 truncate">{name}</span>
            <ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>{t('plan.switcher.plans')}</DropdownMenuLabel>
          <DropdownMenuGroup>
            {plans.map((plan) => (
              <DropdownMenuItem key={plan.id} onSelect={() => onSelectPlan(plan.id)}>
                <span className="min-w-0 flex-1 truncate">{plan.name}</span>
                {plan.id === activePlanId ? <CheckIcon className="size-4" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              onSelect={() => {
                setRenameValue(name);
                setRenameOpen(true);
              }}
            >
              {t('plan.switcher.rename')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onEditAccounts}>{t('plan.accounts.edit.open')}</DropdownMenuItem>
            {/* The gate is enforced in the mutation too; this only explains the lock before the click. */}
            <DropdownMenuItem onSelect={onCreatePlan}>
              <span className="min-w-0 flex-1 truncate">{t('plan.switcher.create')}</span>
              {canCreatePlan ? null : <LockIcon className="size-4 text-muted-foreground" />}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem variant="destructive" onSelect={() => setRestartOpen(true)}>
              {t('plan.restart.action')}
            </DropdownMenuItem>
            {plans.length > 1 ? (
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                {t('plan.switcher.delete')}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('plan.switcher.renameTitle')}</DialogTitle>
            <DialogDescription>{t('plan.switcher.renameDescription')}</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              const next = renameValue.trim();
              if (!next) return;
              void onRenamePlan(activePlanId, next).then((ok) => {
                if (ok) setRenameOpen(false);
              });
            }}
          >
            <Input
              value={renameValue}
              aria-label={t('plan.switcher.nameLabel')}
              onChange={(event) => setRenameValue(event.target.value)}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenameOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={pending || renameValue.trim().length === 0}>
                {t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('plan.switcher.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('plan.switcher.deleteDescription', { name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={() => {
                void onDeletePlan(activePlanId).then((ok) => {
                  if (ok) setDeleteOpen(false);
                });
              }}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={restartOpen} onOpenChange={setRestartOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('plan.restart.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('plan.restart.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          {/* A plan's real origin is the day it was created, which is rarely the day the user gets
              round to correcting it, so the date is asked for rather than assumed to be today. */}
          <Field>
            <FieldLabel htmlFor="plan-restart-date">{t('plan.restart.startDate')}</FieldLabel>
            <Input
              id="plan-restart-date"
              type="date"
              max={today}
              value={restartDate}
              onChange={(event) => setRestartDate(event.target.value)}
            />
            <FieldDescription>{t('plan.restart.startDateHint')}</FieldDescription>
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={restartPending || restartDate.length === 0}
              onClick={() => {
                void onRestartPlan(restartDate).then((ok) => {
                  if (ok) setRestartOpen(false);
                });
              }}
            >
              {restartPending ? t('common.loading') : t('plan.restart.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
