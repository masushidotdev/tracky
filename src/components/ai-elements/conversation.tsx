import * as React from 'react';
import { cn } from '@/lib/utils';

export function Conversation({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('relative min-h-0 flex-1 overflow-y-auto', className)} {...props} />;
}

export function ConversationContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6', className)} {...props} />;
}
