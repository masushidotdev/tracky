import * as React from 'react';

import type { Doc } from '../../../convex/_generated/dataModel';
import { cn } from '@/lib/utils';
import { categoryIconForName, categoryIconForeground, categoryIconIsCurated } from '@/lib/categories';

const FallbackIcon = categoryIconForName(undefined);

function DynamicIconFallback() {
  return <FallbackIcon />;
}

const DynamicCategoryIcon = React.lazy(async () => {
  const { DynamicIcon, dynamicIconImports } = await import('lucide-react/dynamic');

  function LoadedDynamicCategoryIcon({ name }: { name: string }) {
    if (!(name in dynamicIconImports)) return <DynamicIconFallback />;
    return <DynamicIcon name={name as keyof typeof dynamicIconImports} fallback={DynamicIconFallback} />;
  }

  return { default: LoadedDynamicCategoryIcon };
});

export function CategoryIconGlyph({ name }: { name: string | undefined }) {
  const Icon = categoryIconForName(name);
  if (!name || categoryIconIsCurated(name)) return <Icon />;

  return (
    <React.Suspense fallback={<FallbackIcon />}>
      <DynamicCategoryIcon key={name} name={name} />
    </React.Suspense>
  );
}

export function CategoryIcon({
  category,
  className,
}: {
  category: Pick<Doc<'categories'>, 'color' | 'icon'>;
  className?: string;
}) {
  const backgroundColor = category.color ?? '#737373';

  return (
    <span
      className={cn('flex size-9 shrink-0 items-center justify-center rounded-full [&_svg]:size-4', className)}
      style={{ backgroundColor, color: categoryIconForeground(backgroundColor) }}
      aria-hidden="true"
    >
      <CategoryIconGlyph name={category.icon} />
    </span>
  );
}
