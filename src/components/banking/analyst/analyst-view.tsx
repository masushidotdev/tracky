import * as React from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation, usePaginatedQuery } from 'convex/react';
import { optimisticallySendMessage, useUIMessages } from '@convex-dev/agent/react';
import { PanelLeftCloseIcon, PanelLeftOpenIcon } from 'lucide-react';

import { api } from '../../../../convex/_generated/api';
import {
  DEFAULT_ANALYST_MODEL,
  isAnalystRateLimitError,
  loadStoredAnalystModel,
  storeAnalystModel,
} from './helpers';
import { ChatPanel } from './chat-panel';
import { ThreadList } from './thread-list';
import type { SelectableModel } from './helpers';
import { Button } from '@/components/ui/button';
import { analyticsEvents, lengthBucket, trackEvent } from '@/lib/analytics/events';
import { useI18n } from '@/lib/i18n';
import { usePendingAction } from '@/hooks/use-pending-action';
import { cn } from '@/lib/utils';

export function AnalystView({ threadId }: { threadId?: string }) {
  const navigate = useNavigate();
  const { locale, t } = useI18n();
  const openedSent = React.useRef(false);
  const { run, pendingKey } = usePendingAction();
  const [model, setModel] = React.useState<SelectableModel>(DEFAULT_ANALYST_MODEL);
  const [threadsOpen, setThreadsOpen] = React.useState(true);
  const threads = usePaginatedQuery(api.analyst.chat.listThreads, {}, { initialNumItems: 50 });
  const messages = useUIMessages(api.analyst.chat.listThreadMessages, threadId ? { threadId } : 'skip', {
    initialNumItems: 50,
    stream: true,
  });
  const createThread = useMutation(api.analyst.chat.createThread);
  const sendMessage = useMutation(api.analyst.chat.sendMessage).withOptimisticUpdate((store, args) => {
    optimisticallySendMessage(api.analyst.chat.listThreadMessages)(store, {
      threadId: args.threadId,
      prompt: args.prompt,
    });
  });
  const respondToApproval = useMutation(api.analyst.chat.respondToApproval);
  const renameThread = useMutation(api.analyst.chat.renameThread);
  const deleteThread = useMutation(api.analyst.chat.deleteThread);
  const stopStreaming = useMutation(api.analyst.chat.stopStreaming);

  React.useEffect(() => {
    setModel(loadStoredAnalystModel(window.localStorage, threadId));
  }, [threadId]);

  React.useEffect(() => {
    if (openedSent.current) return;
    openedSent.current = true;
    trackEvent(analyticsEvents.analystOpened, {});
  }, []);

  const selectThread = React.useCallback(
    (nextThreadId?: string) => {
      void navigate({ to: '/app/analyst', search: nextThreadId ? { thread: nextThreadId } : {} });
    },
    [navigate],
  );

  const changeModel = (next: SelectableModel) => {
    setModel(next);
    storeAnalystModel(window.localStorage, next, threadId);
  };

  const newThread = () =>
    void run(
      'new',
      async () => {
        const created = await createThread({});
        selectThread(created);
      },
      { error: t('analyst.error.createThread') },
    );

  const activeMessages = messages.results;
  return (
    <div className="relative flex min-h-0 flex-col gap-3 md:flex-row">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="self-start md:absolute md:top-2 md:left-2 md:z-10"
        onClick={() => setThreadsOpen((open) => !open)}
      >
        {threadsOpen ? <PanelLeftCloseIcon /> : <PanelLeftOpenIcon />}
        {threadsOpen ? t('analyst.threads.hide') : t('analyst.threads.show')}
      </Button>
      <div className={cn('min-h-0 md:pt-12', !threadsOpen && 'hidden')}>
        <ThreadList
          threads={threads.results}
          activeThreadId={threadId}
          loading={threads.status === 'LoadingFirstPage'}
          paginationStatus={threads.status}
          pendingKey={pendingKey}
          onSelect={selectThread}
          onNew={newThread}
          onLoadMore={() => threads.loadMore(50)}
          onRename={(id, title) =>
            void run(`rename:${id}`, () => renameThread({ threadId: id, title }).then(() => undefined), {
              error: t('analyst.error.renameThread'),
            })
          }
          onDelete={(id) => {
            const index = threads.results.findIndex((thread) => thread._id === id);
            const nextThreadId = threads.results.at(index + 1)?._id ?? threads.results.at(index - 1)?._id;
            void run(
              `delete:${id}`,
              async () => {
                await deleteThread({ threadId: id });
                if (id === threadId) selectThread(nextThreadId);
              },
              { error: t('analyst.error.deleteThread') },
            );
          }}
        />
      </div>
      <ChatPanel
        threadId={threadId}
        messages={activeMessages}
        loading={messages.status === 'LoadingFirstPage'}
        paginationStatus={messages.status}
        sending={pendingKey === 'send'}
        approvalPending={pendingKey === 'approval'}
        model={model}
        onModelChange={changeModel}
        onNew={newThread}
        onLoadMore={() => messages.loadMore(50)}
        onSend={(prompt) => {
          // Length bucket + model only — never prompt text.
          trackEvent(analyticsEvents.analystMessageSent, {
            message_length_bucket: lengthBucket(prompt.length),
            model_id: model,
          });
          return run(
            'send',
            () => sendMessage({ threadId: threadId!, prompt, modelId: model, locale }).then(() => undefined),
            {
              getErrorMessage: (error) =>
                t(isAnalystRateLimitError(error) ? 'analyst.error.rateLimit' : 'analyst.error.send'),
            },
          );
        }}
        onApproval={(approvalId, approve) =>
          void run(
            'approval',
            () =>
              respondToApproval({ threadId: threadId!, approvalId, approve, modelId: model, locale }).then(
                () => undefined,
              ),
            { error: t('analyst.error.approval') },
          )
        }
        onStop={(order) =>
          void run('stop', () => stopStreaming({ threadId: threadId!, order }).then(() => undefined), {
            error: t('analyst.error.stop'),
          })
        }
      />
    </div>
  );
}
