import * as React from 'react';
import { CalculatorIcon, InfoIcon } from 'lucide-react';
import type { MDXComponents } from 'mdx/types';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

type TitledBlockProps = Readonly<{
  children: React.ReactNode;
  title?: string;
}>;

export function Callout({ children, title }: TitledBlockProps) {
  return (
    <Alert className="my-6">
      <InfoIcon />
      {title ? <AlertTitle>{title}</AlertTitle> : null}
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

export function CalculationBreakdown({ children, title }: TitledBlockProps) {
  return (
    <Alert className="my-6 border-primary/20 bg-muted/50">
      <CalculatorIcon />
      {title ? <AlertTitle>{title}</AlertTitle> : null}
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

export function Steps({ children }: Readonly<{ children: React.ReactNode }>) {
  return <ol className="my-6 grid gap-6 [counter-reset:docs-step]">{children}</ol>;
}

export function Step({ children, title }: TitledBlockProps) {
  return (
    <li className="relative grid gap-1 pl-12 [counter-increment:docs-step] before:absolute before:top-0 before:left-0 before:flex before:size-8 before:items-center before:justify-center before:rounded-full before:border before:bg-muted before:text-sm before:font-medium before:text-foreground before:content-[counter(docs-step)]">
      {title ? <p className="font-medium text-foreground">{title}</p> : null}
      <div className="text-muted-foreground">{children}</div>
    </li>
  );
}

export function Figure({
  alt,
  caption,
  className,
  ...props
}: React.ComponentProps<'img'> & { caption?: string }) {
  return (
    <figure className="my-8 grid gap-3">
      <img
        alt={alt ?? ''}
        className={cn('rounded-2xl border bg-muted', className)}
        decoding="async"
        loading="lazy"
        {...props}
      />
      {caption ? <figcaption className="text-center text-sm text-muted-foreground">{caption}</figcaption> : null}
    </figure>
  );
}

function DocsLink({ href, ...props }: React.ComponentProps<'a'>) {
  const isExternal = href?.startsWith('http://') || href?.startsWith('https://');
  return <a href={href} rel={isExternal ? 'noreferrer noopener' : undefined} {...props} />;
}

function DocsImage(props: React.ComponentProps<'img'>) {
  return <img decoding="async" loading="lazy" {...props} />;
}

function DocsTable({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <div className="my-6 overflow-x-auto rounded-xl border">
      <table className={cn('w-full', className)} {...props} />
    </div>
  );
}

export const docsMdxComponents: MDXComponents = {
  a: DocsLink,
  h1: () => null,
  img: DocsImage,
  table: DocsTable,
  Callout,
  CalculationBreakdown,
  Figure,
  Step,
  Steps,
};
