import type { Doc } from '../../../convex/_generated/dataModel';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type TagBadgeProps = {
  className?: string;
  tag: Pick<Doc<'transactionTags'>, 'color' | 'name'>;
};

export function TagBadge({ className, tag }: TagBadgeProps) {
  return (
    <Badge variant="outline" className={cn('max-w-40 gap-1.5 font-normal', className)} title={tag.name}>
      <span
        aria-hidden="true"
        className={cn('size-2 shrink-0 rounded-full', !tag.color && 'bg-muted-foreground')}
        style={tag.color ? { backgroundColor: tag.color } : undefined}
      />
      <span className="truncate">{tag.name}</span>
    </Badge>
  );
}
