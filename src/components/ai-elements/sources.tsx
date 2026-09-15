import * as React from 'react';
import { ExternalLinkIcon, FileTextIcon } from 'lucide-react';

export function Sources({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <section className="mt-3 border-t pt-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

export function Source({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-xs hover:bg-muted"
    >
      <span className="truncate">{children}</span>
      <ExternalLinkIcon className="size-3 shrink-0" />
    </a>
  );
}

export function SourceDocument({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-xs">
      <FileTextIcon className="size-3 shrink-0" />
      <span className="truncate">{children}</span>
    </span>
  );
}
