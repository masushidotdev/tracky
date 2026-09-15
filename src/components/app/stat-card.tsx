import { InfoIcon } from 'lucide-react';

import type * as React from 'react';

import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type StatCardProps = {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  help?: React.ReactNode;
  delta?: { value: React.ReactNode; tone: 'positive' | 'negative' | 'neutral' };
  action?: React.ReactNode;
  className?: string;
  onClick?: () => void;
  ariaLabel?: string;
};

const deltaToneClass = {
  positive: 'text-positive',
  negative: 'text-destructive',
  neutral: 'text-muted-foreground',
} as const;

function StatCardHelp({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={t('statCard.help')}
          className="text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:text-foreground"
        >
          <InfoIcon className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64 text-pretty normal-case tracking-normal">{children}</TooltipContent>
    </Tooltip>
  );
}

export function StatCard({ action, ariaLabel, className, delta, help, hint, label, onClick, value }: StatCardProps) {
  return (
    <Card
      size="sm"
      aria-label={ariaLabel}
      className={cn(
        onClick
          ? 'cursor-pointer transition-shadow hover:shadow-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
          : undefined,
        className,
      )}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <CardContent className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">
          <span>{label}</span>
          {help ? <StatCardHelp>{help}</StatCardHelp> : null}
        </div>
        <div className="flex min-w-0 items-baseline gap-2">
          <div className="min-w-0 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
          {delta ? <div className={cn('text-xs font-medium', deltaToneClass[delta.tone])}>{delta.value}</div> : null}
        </div>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
        {action ? <div className="pt-2">{action}</div> : null}
      </CardContent>
    </Card>
  );
}

export function StatCardGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4', className)}>{children}</div>;
}
