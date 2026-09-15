import * as React from 'react';

import type { Doc } from '../../../../convex/_generated/dataModel';
import { Amount } from '@/components/app/amount';
import { EmptyState } from '@/components/app/empty-state';
import { ListSkeleton } from '@/components/app/skeletons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { formatIsoDate } from '@/lib/format';

type Transaction = Doc<'transactions'>;

type TransferCandidatesCardProps = {
  candidates: Array<Transaction> | undefined;
  intlLocale: string;
  isPending: (key?: string) => boolean;
  labels: {
    empty: string;
    match: string;
    searching: string;
    title: string;
  };
  onMatch: (candidate: Transaction) => void;
  selectedTransfer: Transaction | null;
};

export function TransferCandidatesCard({
  candidates,
  intlLocale,
  isPending,
  labels,
  onMatch,
  selectedTransfer,
}: TransferCandidatesCardProps) {
  const cardRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (selectedTransfer) {
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedTransfer, candidates]);

  if (!selectedTransfer) {
    return null;
  }

  return (
    <div ref={cardRef}>
      <Card size="sm">
        <CardHeader>
          <CardTitle>{labels.title.replace('{description}', selectedTransfer.description)}</CardTitle>
        </CardHeader>
        <CardContent>
          {candidates === undefined ? <ListSkeleton rows={2} /> : null}
          {candidates?.length === 0 ? <EmptyState title={labels.empty} /> : null}
          {candidates && candidates.length > 0 ? (
            <div className="divide-y divide-border/60">
              {candidates.map((candidate) => {
                const pendingKey = `match-transfer:${candidate._id}`;

                return (
                  <div
                    key={candidate._id}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{candidate.description}</div>
                      <div className="text-sm text-muted-foreground">
                        {formatIsoDate(candidate.bookingDate, intlLocale)}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <Amount
                        variant="signed"
                        direction={candidate.direction}
                        money={candidate.amount}
                        className="text-sm font-medium"
                        sensitive={false}
                      />
                      <Button size="sm" disabled={isPending()} onClick={() => onMatch(candidate)}>
                        {isPending(pendingKey) ? <Spinner data-icon="inline-start" /> : null}
                        {labels.match}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
