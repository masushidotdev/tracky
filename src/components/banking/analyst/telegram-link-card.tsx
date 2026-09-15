import * as React from 'react';
import { CheckIcon, CopyIcon, LinkIcon, UnlinkIcon } from 'lucide-react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';

import { api } from '../../../../convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useI18n } from '@/lib/i18n';

export function TelegramLinkCard() {
  const { t } = useI18n();
  const status = useQuery(api.analyst.telegram.telegramStatus);
  const generateCode = useAction(api.analyst.telegram.generateTelegramLinkCode);
  const unlink = useMutation(api.analyst.telegram.unlinkTelegram);
  const [pending, setPending] = React.useState<'generate' | 'unlink' | null>(null);
  const [command, setCommand] = React.useState<string | null>(null);
  const runGenerate = async () => {
    setPending('generate');
    try {
      const result = await generateCode({});
      setCommand(result.command);
    } catch {
      toast.error(t('analyst.telegram.error'));
    } finally {
      setPending(null);
    }
  };
  const runUnlink = async () => {
    setPending('unlink');
    try {
      await unlink({});
      setCommand(null);
    } catch {
      toast.error(t('analyst.telegram.error'));
    } finally {
      setPending(null);
    }
  };
  return (
    <div className="border-t p-3">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <LinkIcon className="size-4" />
        {t('analyst.telegram.title')}
      </div>
      {status === undefined ? (
        <div className="flex justify-center py-3"><Spinner /></div>
      ) : status.linked ? (
        <>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <CheckIcon className="size-3.5 text-positive" />
            {t('analyst.telegram.linked', { suffix: status.chatSuffix })}
          </p>
          <Button className="mt-2 w-full" size="sm" variant="outline" disabled={pending !== null} onClick={runUnlink}>
            {pending === 'unlink' ? <Spinner /> : <UnlinkIcon />}
            {t('analyst.telegram.unlink')}
          </Button>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{t('analyst.telegram.description')}</p>
          {command ? (
            <div className="mt-2 rounded-xl bg-muted p-2">
              <code className="block break-all text-xs">{command}</code>
              <Button
                className="mt-2 w-full"
                size="sm"
                variant="ghost"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(command);
                    toast.success(t('analyst.telegram.copied'));
                  } catch {
                    toast.error(t('analyst.telegram.error'));
                  }
                }}
              >
                <CopyIcon />
                {t('analyst.telegram.copy')}
              </Button>
              <p className="mt-1 text-[0.7rem] text-muted-foreground">{t('analyst.telegram.expires')}</p>
            </div>
          ) : (
            <Button className="mt-2 w-full" size="sm" variant="outline" disabled={pending !== null} onClick={runGenerate}>
              {pending === 'generate' ? <Spinner /> : <LinkIcon />}
              {t('analyst.telegram.generate')}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
