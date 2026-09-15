import { createFileRoute, redirect } from '@tanstack/react-router';

import { parseBankConnectionSearch } from '@/lib/bank-connection-search';

export const Route = createFileRoute('/_authenticated/_app/app/accounts/')({
  validateSearch: parseBankConnectionSearch,
  beforeLoad: ({ search }) => {
    throw redirect({
      to: '/app/settings/bank-connections',
      search,
      replace: true,
    });
  },
});
