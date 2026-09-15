import agent from '@convex-dev/agent/convex.config';
import rateLimiter from '@convex-dev/rate-limiter/convex.config';
import resend from '@convex-dev/resend/convex.config';
import workOSAuthKit from '@convex-dev/workos-authkit/convex.config';
import { defineApp } from 'convex/server';

const app = defineApp();
app.use(workOSAuthKit);
app.use(agent);
app.use(rateLimiter);
app.use(resend);
export default app;
