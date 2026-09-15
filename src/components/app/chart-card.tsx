import type { LucideIcon } from 'lucide-react';
import type * as React from 'react';

import { EmptyState } from '@/components/app/empty-state';
import { ChartSkeleton } from '@/components/app/skeletons';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type ChartCardProps<T> = {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  data: ReadonlyArray<T> | undefined;
  height?: number;
  empty: { icon?: LucideIcon; title: React.ReactNode; hint?: React.ReactNode };
  children: (data: ReadonlyArray<T>) => React.ReactNode;
  className?: string;
};

export function ChartCard<T>({
  action,
  children,
  className,
  data,
  description,
  empty,
  height = 260,
  title,
}: ChartCardProps<T>) {
  return (
    <Card size="sm" className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent>
        <div
          className={cn('w-full', data?.length === 0 ? 'flex items-center justify-center' : undefined)}
          style={{ height }}
        >
          {data === undefined ? <ChartSkeleton height={height} /> : null}
          {data?.length === 0 ? (
            <EmptyState className="min-h-0 border-0 p-0" icon={empty.icon} title={empty.title} hint={empty.hint} />
          ) : null}
          {data && data.length > 0 ? children(data) : null}
        </div>
      </CardContent>
    </Card>
  );
}
