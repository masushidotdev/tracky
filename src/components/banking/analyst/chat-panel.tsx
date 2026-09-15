import * as React from 'react';
import { BotIcon, SendIcon, SquareIcon } from 'lucide-react';
import { AnalystModelSelect } from './analyst-model-select';
import {
  clearAnalystDailyLimitReached,
  getAnalystDailyLimitReached,
  subscribeToAnalystDailyLimit,
} from './helpers';
import { MessageParts } from './message-parts';
import type { UIMessage } from '@convex-dev/agent/react';

import type { SelectableModel } from './helpers';
import { Button } from '@/components/ui/button';
import { Conversation, ConversationContent } from '@/components/ai-elements/conversation';
import { EmptyState } from '@/components/app/empty-state';
import { UpgradeCta } from '@/components/app/upgrade-cta';
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@/components/ai-elements/prompt-input';
import { Spinner } from '@/components/ui/spinner';
import { Suggestion } from '@/components/ai-elements/suggestion';
import { useI18n } from '@/lib/i18n';
import { useEntitlements } from '@/lib/entitlements';

export function ChatPanel({
  threadId,
  messages,
  loading,
  paginationStatus,
  sending,
  approvalPending,
  model,
  onModelChange,
  onSend,
  onStop,
  onApproval,
  onNew,
  onLoadMore,
}: {
  threadId?: string;
  messages: Array<UIMessage>;
  loading: boolean;
  paginationStatus: 'CanLoadMore' | 'LoadingMore' | 'Exhausted' | 'LoadingFirstPage';
  sending: boolean;
  approvalPending: boolean;
  model: SelectableModel;
  onModelChange: (model: SelectableModel) => void;
  onSend: (prompt: string) => Promise<boolean>;
  onStop: (order: number) => void;
  onApproval: (approvalId: string, approve: boolean) => void;
  onNew: () => void;
  onLoadMore: () => void;
}) {
  const { t } = useI18n();
  const entitlements = useEntitlements();
  const dailyLimitReached = React.useSyncExternalStore(
    subscribeToAnalystDailyLimit,
    getAnalystDailyLimitReached,
    getAnalystDailyLimitReached,
  );
  const [prompt, setPrompt] = React.useState('');
  const [submitPending, setSubmitPending] = React.useState(false);
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const prependRef = React.useRef<{ height: number; top: number } | null>(null);
  const previousMessageCountRef = React.useRef(0);
  const streamingOrder = messages.reduce(
    (highest, message) => (message.status === 'streaming' ? Math.max(highest, message.order) : highest),
    -1,
  );
  React.useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (prependRef.current) {
      viewport.scrollTop = prependRef.current.top + viewport.scrollHeight - prependRef.current.height;
      prependRef.current = null;
    } else if (
      previousMessageCountRef.current === 0 ||
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 180
    ) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
    }
    previousMessageCountRef.current = messages.length;
  }, [messages]);
  const submit = async () => {
    const next = prompt.trim();
    if (!next || sending || submitPending || streamingOrder >= 0 || !threadId) return;
    setSubmitPending(true);
    const sent = await onSend(next);
    if (sent) {
      clearAnalystDailyLimitReached();
      setPrompt('');
    }
    setSubmitPending(false);
  };
  if (!threadId)
    return (
      <EmptyState
        icon={BotIcon}
        title={t('analyst.empty.title')}
        hint={t('analyst.empty.description')}
        action={<Button onClick={onNew}>{t('analyst.threads.new')}</Button>}
        className="min-h-[32rem] flex-1 rounded-3xl border bg-card"
      />
    );
  return (
    <section className="flex min-h-[36rem] min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border bg-card">
      <Conversation ref={viewportRef}>
        <ConversationContent>
          {paginationStatus === 'CanLoadMore' || paginationStatus === 'LoadingMore' ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="self-center"
              disabled={paginationStatus === 'LoadingMore'}
              onClick={() => {
                const viewport = viewportRef.current;
                if (viewport) prependRef.current = { height: viewport.scrollHeight, top: viewport.scrollTop };
                onLoadMore();
              }}
            >
              {paginationStatus === 'LoadingMore' ? <Spinner /> : null}
              {t('analyst.messages.loadOlder')}
            </Button>
          ) : null}
          {loading ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : messages.length === 0 ? (
            <EmptyState icon={BotIcon} title={t('analyst.welcome.title')} hint={t('analyst.welcome.description')} />
          ) : (
            messages.map((message) => (
              <MessageParts
                key={message.key}
                message={message}
                approvalPending={approvalPending}
                onApproval={onApproval}
              />
            ))
          )}
        </ConversationContent>
      </Conversation>
      <div className="flex flex-col gap-3 border-t bg-background/70 p-3">
        {dailyLimitReached && entitlements?.tier === 'free' ? <UpgradeCta dailyLimitReached /> : null}
        {messages.length === 0 ? (
          <div className="flex flex-wrap gap-2">
            {(['overview', 'plan', 'future', 'subscriptions', 'purchase'] as const).map((key) => (
              <Suggestion key={key} onClick={() => setPrompt(t(`analyst.suggestion.${key}`))}>
                {t(`analyst.suggestion.${key}`)}
              </Suggestion>
            ))}
          </div>
        ) : null}
        <PromptInput
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <PromptInputTextarea
            value={prompt}
            placeholder={t('analyst.composer.placeholder')}
            disabled={sending || submitPending || streamingOrder >= 0}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
          />
          <PromptInputFooter>
            <AnalystModelSelect value={model} onChange={onModelChange} />
            {streamingOrder >= 0 ? (
              <Button type="button" size="sm" variant="outline" onClick={() => onStop(streamingOrder)}>
                <SquareIcon />
                {t('analyst.stop')}
              </Button>
            ) : (
              <PromptInputSubmit disabled={!prompt.trim() || sending || submitPending}>
                {sending || submitPending ? <Spinner /> : <SendIcon />}
                {t('analyst.send')}
              </PromptInputSubmit>
            )}
          </PromptInputFooter>
        </PromptInput>
      </div>
    </section>
  );
}
