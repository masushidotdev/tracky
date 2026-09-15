import { createFileRoute } from '@tanstack/react-router';

import { DocsLayout } from '@/components/docs/docs-layout';

export const Route = createFileRoute('/_authenticated/_app/app/docs')({
  component: DocsRouteLayout,
});

function DocsRouteLayout() {
  return <DocsLayout />;
}
