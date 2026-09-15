import { createFileRoute, notFound } from '@tanstack/react-router';

import { DocsPage } from '@/components/docs/docs-page';
import { docsManifest } from '@/lib/docs/content';

export const Route = createFileRoute('/_authenticated/_app/app/docs/$slug')({
  loader: ({ params }) => {
    if (!docsManifest.some((doc) => doc.slug === params.slug)) {
      throw notFound();
    }
  },
  head: ({ params }) => {
    const doc = docsManifest.find((entry) => entry.slug === params.slug);
    return doc
      ? {
          meta: [
            { title: `${doc.title} · Tracky Docs` },
            { name: 'description', content: doc.description },
          ],
        }
      : {};
  },
  component: DocsPageRoute,
});

function DocsPageRoute() {
  const { slug } = Route.useParams();
  return <DocsPage slug={slug} />;
}
