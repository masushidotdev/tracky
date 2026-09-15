import { useConvexAuth, useQuery } from 'convex/react';

import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server';

/**
 * Every Convex query behind `requireAuthUser` throws Unauthorized when it is asked before the client
 * holds a token, and `useQuery` rethrows that during render — which blanks whatever tree it sits in,
 * the whole app when the caller is the sidebar or the header. Skipping until authentication settles
 * keeps that race out of each call site; the caller still sees `undefined` and shows its loading
 * state, exactly as it does before the first result arrives.
 */
export function useAuthedQuery<TQuery extends FunctionReference<'query'>>(
  query: TQuery,
  args: FunctionArgs<TQuery> | 'skip',
): FunctionReturnType<TQuery> | undefined {
  const { isAuthenticated } = useConvexAuth();

  return useQuery(query, isAuthenticated ? args : 'skip');
}
