import { Link } from '@tanstack/react-router';
import { PiggyBankIcon } from 'lucide-react';

import type { api } from '../../../../convex/_generated/api';
import type { FunctionReturnType } from 'convex/server';
import { Amount } from '@/components/app/amount';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

type FundingPlan = FunctionReturnType<typeof api.banking.planning.listMoneyBoxFundingPlans>[number];

export function MoneyBoxAccountRows({
  labels,
  moneyBoxes,
}: {
  labels: { empty: string; manage: string; savedOfTarget: string; title: string; virtual: string };
  moneyBoxes: Array<FundingPlan>;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">{labels.title}</h3>
        <Button asChild size="sm" variant="ghost">
          <Link to="/app/planning">{labels.manage}</Link>
        </Button>
      </div>
      {moneyBoxes.length === 0 ? <p className="py-3 text-sm text-muted-foreground">{labels.empty}</p> : null}
      <div className="divide-y divide-border/60">
        {moneyBoxes.map(({ funding, moneyBox }) => (
          <div key={moneyBox._id} className="flex items-center gap-3 py-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <PiggyBankIcon />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{moneyBox.name}</span>
                <Badge variant="secondary">{labels.virtual}</Badge>
              </div>
              <div className="mt-2 max-w-72">
                <Progress value={funding.progressPercent} />
              </div>
            </div>
            <div className="text-right">
              <Amount money={moneyBox.savedAmount} variant="neutral" />
              <div className="text-xs text-muted-foreground">
                {labels.savedOfTarget} <Amount money={moneyBox.targetAmount} variant="neutral" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
