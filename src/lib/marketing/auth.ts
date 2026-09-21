import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

export type MarketingAuthData = { user: unknown | null; signInUrl: string; signUpUrl: string };

/**
 * Shared loader for the 30 public marketing routes.
 * Degrades to logged-out CTAs when WorkOS secrets are absent
 * (e.g. secret-less staging workers); /app/* stays gated by loaders.
 */
export async function loadMarketingAuth(): Promise<MarketingAuthData> {
  try {
    const { user } = await getAuth();
    const signInUrl = await getSignInUrl({ data: { returnPathname: '/app' } });
    const signUpUrl = await getSignUpUrl({ data: { returnPathname: '/app' } });
    return { user, signInUrl, signUpUrl };
  } catch {
    return { user: null, signInUrl: '/app', signUpUrl: '/app' };
  }
}
