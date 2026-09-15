import * as React from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export function TruncatedText({ className, value }: { className?: string; value: string }) {
  const textRef = React.useRef<HTMLSpanElement | null>(null);
  const [isTruncated, setIsTruncated] = React.useState(false);

  React.useEffect(() => {
    const element = textRef.current;
    if (!element || typeof window === 'undefined') {
      return;
    }

    const updateTruncation = () => {
      const nextIsTruncated = element.scrollWidth > element.clientWidth;
      setIsTruncated((currentIsTruncated) =>
        currentIsTruncated === nextIsTruncated ? currentIsTruncated : nextIsTruncated,
      );
    };

    updateTruncation();

    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateTruncation);
    resizeObserver?.observe(element);
    window.addEventListener('resize', updateTruncation);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateTruncation);
    };
  }, [isTruncated, value]);

  const text = (
    <span ref={textRef} className={cn('truncate', className)}>
      {value}
    </span>
  );

  if (!isTruncated) {
    return text;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{text}</TooltipTrigger>
      <TooltipContent>
        <span className="whitespace-normal wrap-break-word">{value}</span>
      </TooltipContent>
    </Tooltip>
  );
}
