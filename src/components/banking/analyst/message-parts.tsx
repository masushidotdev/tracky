import { AlertCircleIcon } from 'lucide-react';
import { isToolUIPart } from 'ai';
import { ToolPart } from './tool-part';
import type { UIMessage } from '@convex-dev/agent/react';

import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import { Reasoning } from '@/components/ai-elements/reasoning';
import { Source, SourceDocument, Sources } from '@/components/ai-elements/sources';
import { useI18n } from '@/lib/i18n';

export function MessageParts({
  message,
  approvalPending,
  onApproval,
}: {
  message: UIMessage;
  approvalPending: boolean;
  onApproval: (approvalId: string, approve: boolean) => void;
}) {
  const { t } = useI18n();
  const sources = message.parts.filter((part) => part.type === 'source-url' || part.type === 'source-document');
  return (
    <Message from={message.role}>
      <MessageContent
        from={message.role}
        className={message.role === 'assistant' ? 'w-full max-w-full px-0 py-0' : undefined}
      >
        <div className="flex flex-col gap-3">
          {message.parts.map((part, index) => {
            if (part.type === 'text') return <MessageResponse key={index}>{part.text}</MessageResponse>;
            if (part.type === 'reasoning')
              return (
                <Reasoning key={index} label={t('analyst.reasoning')}>
                  {part.text}
                </Reasoning>
              );
            if (isToolUIPart(part))
              return (
                <ToolPart key={part.toolCallId} part={part} approvalPending={approvalPending} onApproval={onApproval} />
              );
            return null;
          })}
          {message.status === 'failed' ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
              <span>{t('analyst.error.response')}</span>
            </div>
          ) : null}
        </div>
        {sources.length > 0 ? (
          <Sources label={t('analyst.sources')}>
            {sources.map((source) =>
              source.type === 'source-url' && /^https?:\/\//.test(source.url) ? (
                <Source key={source.sourceId} href={source.url}>
                  {source.title ?? source.url}
                </Source>
              ) : (
                <SourceDocument key={source.sourceId}>{source.title || t('analyst.source.document')}</SourceDocument>
              ),
            )}
          </Sources>
        ) : null}
      </MessageContent>
    </Message>
  );
}
