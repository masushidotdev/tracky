import * as React from 'react';

import { Button } from '@/components/ui/button';

export function Suggestion(props: React.ComponentProps<typeof Button>) {
  return (
    <Button type="button" variant="outline" size="sm" className="h-auto whitespace-normal rounded-full" {...props} />
  );
}
