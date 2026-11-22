import agent from '@convex-dev/agent/convex.config';
import rateLimiter from '@convex-dev/rate-limiter/convex.config';
import resend from '@convex-dev/resend/convex.config';
import workOSAuthKit from '@convex-dev/workos-authkit/convex.config';
import { defineApp } from 'convex/server';
import { v } from 'convex/values';

// Optional integrations stay disabled until configured; callsites validate required secrets.
const app = defineApp({
  env: {
    AI_GATEWAY_API_KEY: v.optional(v.string()),
    ENABLE_BANKING_API_BASE: v.optional(v.string()),
    ENABLE_BANKING_APP_ID: v.optional(v.string()),
    ENABLE_BANKING_PRIVATE_KEY: v.optional(v.string()),
    ENABLE_BANKING_REDIRECT_URL: v.optional(v.string()),
    ENABLE_BANKING_RETURN_URL: v.optional(v.string()),
    LANGFUSE_BASE_URL: v.optional(v.string()),
    LANGFUSE_PUBLIC_KEY: v.optional(v.string()),
    LANGFUSE_SECRET_KEY: v.optional(v.string()),
    OPENROUTER_API_KEY: v.optional(v.string()),
    RESEND_API_KEY: v.optional(v.string()),
    RESEND_FROM_EMAIL: v.optional(v.string()),
    RESEND_WEBHOOK_SECRET: v.optional(v.string()),
    TELEGRAM_BOT_TOKEN: v.optional(v.string()),
    TELEGRAM_WEBHOOK_SECRET: v.optional(v.string()),
    TELEGRAM_WEBHOOK_URL: v.optional(v.string()),
    WORKOS_API_KEY: v.optional(v.string()),
    WORKOS_CLIENT_ID: v.optional(v.string()),
    WORKOS_WEBHOOK_SECRET: v.optional(v.string()),
  },
});
app.use(workOSAuthKit);
app.use(agent);
app.use(rateLimiter);
app.use(resend);
export default app;
