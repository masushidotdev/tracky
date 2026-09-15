import * as React from 'react';
import { useMutation, useQuery } from 'convex/react';
import { BrainIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';

import { api } from '../../../convex/_generated/api';
import type { TranslationKey } from '@/lib/i18n';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/app/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useI18n } from '@/lib/i18n';

const memoryKindKeys = {
  fact: 'settings.memories.kind.fact',
  preference: 'settings.memories.kind.preference',
  goal: 'settings.memories.kind.goal',
} as const satisfies Record<string, TranslationKey>;

export function MemoriesCard() {
  const { t } = useI18n();
  const memories = useQuery(api.analyst.memoryStore.listMyMemories, {});
  const deleteMemory = useMutation(api.analyst.memoryStore.deleteMyMemory);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const remove = async (memoryId: (NonNullable<typeof memories>)[number]['_id']) => {
    setDeletingId(memoryId);
    try {
      await deleteMemory({ memoryId });
      toast.success(t('settings.memories.deleted'));
    } catch {
      toast.error(t('settings.memories.deleteFailed'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.memories.title')}</CardTitle>
        <CardDescription>{t('settings.memories.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {memories === undefined ? (
          <div className="flex flex-col gap-3" aria-label={t('settings.loading')}>
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : memories.length === 0 ? (
          <EmptyState icon={BrainIcon} title={t('settings.memories.empty')} hint={t('settings.memories.emptyHint')} />
        ) : (
          <ul className="flex flex-col gap-3">
            {memories.map((memory) => (
              <li key={memory._id} className="flex items-start justify-between gap-3 rounded-2xl border p-3">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Badge variant="secondary">{t(memoryKindKeys[memory.kind])}</Badge>
                  <p className="text-sm leading-relaxed">{memory.content}</p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      disabled={deletingId !== null}
                      aria-label={t('settings.memories.delete')}
                    >
                      <Trash2Icon />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('settings.memories.confirmTitle')}</AlertDialogTitle>
                      <AlertDialogDescription>{t('settings.memories.confirmDescription')}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('settings.cancel')}</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={() => void remove(memory._id)}>
                        {t('settings.memories.delete')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
