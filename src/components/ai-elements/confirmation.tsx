import * as React from 'react';
import { ShieldCheckIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function Confirmation({ className, ...props }: React.ComponentProps<'section'>) {
  return <section className={cn('rounded-3xl border border-warning/35 bg-warning/5 p-4', className)} {...props} />;
}

export function ConfirmationTitle({ className, ...props }: React.ComponentProps<'h3'>) {
  return (
    <h3 className={cn('flex items-center gap-2 text-sm font-semibold', className)} {...props}>
      <ShieldCheckIcon className="size-4 text-warning" />
      {props.children}
    </h3>
  );
}

export function ConfirmationActions({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('mt-4 flex flex-wrap gap-2', className)} {...props} />;
}

export function ConfirmationAction(props: React.ComponentProps<typeof Button>) {
  return <Button type="button" size="sm" {...props} />;
}
