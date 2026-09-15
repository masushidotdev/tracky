import * as React from 'react';
import { Outlet } from '@tanstack/react-router';
import { BookOpenIcon } from 'lucide-react';

import { DocsNavigation } from '@/components/docs/docs-navigation';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { getDocsCopy } from '@/lib/docs/copy';
import { useI18n } from '@/lib/i18n';

export function DocsLayout() {
  const [navigationOpen, setNavigationOpen] = React.useState(false);
  const { locale } = useI18n();
  const copy = getDocsCopy(locale);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 items-start">
      <aside className="sticky top-(--header-height) hidden h-[calc(100dvh-var(--header-height))] w-68 shrink-0 border-r lg:block">
        <DocsNavigation />
      </aside>

      <div className="min-w-0 flex-1">
        <div className="border-b p-4 lg:hidden">
          <Sheet open={navigationOpen} onOpenChange={setNavigationOpen}>
            <SheetTrigger asChild>
              <Button variant="outline">
                <BookOpenIcon data-icon="inline-start" />
                {copy.menu}
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[min(22rem,90vw)] gap-0">
              <SheetHeader>
                <SheetTitle>{copy.title}</SheetTitle>
                <SheetDescription>{copy.navigationDescription}</SheetDescription>
              </SheetHeader>
              <div className="min-h-0 flex-1">
                <DocsNavigation onNavigate={() => setNavigationOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
        </div>

        <Outlet />
      </div>
    </div>
  );
}
