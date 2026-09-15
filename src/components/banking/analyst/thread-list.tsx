import * as React from 'react';
import { MessageSquarePlusIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { TelegramLinkCard } from './telegram-link-card';
import type { ThreadDoc } from '@convex-dev/agent';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/app/empty-state';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { formatDateTime } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function ThreadList({
  threads,
  activeThreadId,
  loading,
  paginationStatus,
  pendingKey,
  onSelect,
  onNew,
  onRename,
  onDelete,
  onLoadMore,
}: {
  threads: Array<ThreadDoc>;
  activeThreadId?: string;
  loading: boolean;
  paginationStatus: 'CanLoadMore' | 'LoadingMore' | 'Exhausted' | 'LoadingFirstPage';
  pendingKey: string | null;
  onSelect: (threadId: string) => void;
  onNew: () => void;
  onRename: (threadId: string, title: string) => void;
  onDelete: (threadId: string) => void;
  onLoadMore: () => void;
}) {
  const { intlLocale, t } = useI18n();
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState('');
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  return (
    <aside className="flex min-h-0 flex-col rounded-3xl border bg-card md:w-72 md:shrink-0">
      <div className="flex items-center justify-between border-b p-3">
        <h2 className="text-sm font-semibold">{t('analyst.threads.title')}</h2>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t('analyst.threads.new')}
          onClick={onNew}
          disabled={pendingKey === 'new'}
        >
          {pendingKey === 'new' ? <Spinner /> : <MessageSquarePlusIcon />}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex justify-center p-6">
            <Spinner />
          </div>
        ) : threads.length === 0 ? (
          <EmptyState title={t('analyst.threads.empty')} className="py-8" />
        ) : (
          threads.map((thread) => (
            <div
              key={thread._id}
              className={cn(
                'group mb-1 rounded-2xl p-2',
                activeThreadId === thread._id ? 'bg-muted' : 'hover:bg-muted/60',
              )}
            >
              {editingId === thread._id ? (
                <form
                  className="flex gap-1"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (title.trim()) onRename(thread._id, title);
                    setEditingId(null);
                  }}
                >
                  <Input autoFocus value={title} maxLength={60} onChange={(event) => setTitle(event.target.value)} />
                  <Button size="sm" type="submit">
                    {t('common.save')}
                  </Button>
                </form>
              ) : (
                <div className="flex items-start gap-1">
                  <button type="button" onClick={() => onSelect(thread._id)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-medium">
                      {thread.title || t('analyst.threads.untitled')}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(thread._creationTime, intlLocale)}
                    </span>
                  </button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={t('analyst.threads.rename')}
                    onClick={() => {
                      setTitle(thread.title ?? '');
                      setEditingId(thread._id);
                    }}
                  >
                    <PencilIcon />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={t('analyst.threads.delete')}
                    onClick={() => setDeleteId(thread._id)}
                    disabled={pendingKey === `delete:${thread._id}`}
                  >
                    {pendingKey === `delete:${thread._id}` ? <Spinner /> : <Trash2Icon />}
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
        {paginationStatus === 'CanLoadMore' || paginationStatus === 'LoadingMore' ? (
          <Button
            className="mt-2 w-full"
            type="button"
            size="sm"
            variant="ghost"
            onClick={onLoadMore}
            disabled={paginationStatus === 'LoadingMore'}
          >
            {paginationStatus === 'LoadingMore' ? <Spinner /> : null}
            {t('analyst.threads.loadMore')}
          </Button>
        ) : null}
      </div>
      <TelegramLinkCard />
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('analyst.threads.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('analyst.threads.deleteConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteId) onDelete(deleteId);
                setDeleteId(null);
              }}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}
