import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

export function useEntitlements() {
  return useQuery(api.entitlements.getMyEntitlements, {});
}
