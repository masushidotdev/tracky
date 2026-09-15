import { createFileRoute } from '@tanstack/react-router';

import { DocsIndex } from '@/components/docs/docs-index';

export const Route = createFileRoute('/_authenticated/_app/app/docs/')({
  component: DocsIndex,
});
