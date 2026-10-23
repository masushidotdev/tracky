import { env, query } from '../_generated/server';
import { requireAuthUser } from '../auth';

export function isEnableBankingConfigured() {
  return Boolean(
    env.ENABLE_BANKING_APP_ID &&
      env.ENABLE_BANKING_PRIVATE_KEY &&
      env.ENABLE_BANKING_REDIRECT_URL,
  );
}

export function isMissingEnvError(error: unknown) {
  return error instanceof Error && error.message.startsWith('Missing Convex environment variable:');
}

export const getProviderAvailability = query({
  args: {},
  handler: async (ctx) => {
    await requireAuthUser(ctx);
    return { configured: isEnableBankingConfigured() };
  },
});
