# PostHog Error Tracking

## What you still need to do

1. Add `POSTHOG_API_KEY` as an encrypted/secret variable in both the staging and production Cloudflare Workers Builds configurations. This must be a personal API key with the Source map upload preset; create one at https://eu.posthog.com/settings/user-api-keys. The local `.env.local` already contains the upload credentials, so no new local key setup is required.
2. Add `POSTHOG_PROJECT_ID` and `POSTHOG_HOST` to both the staging and production Cloudflare Workers Builds configurations. Add the public client variable `VITE_POSTHOG_KEY` there as well; it is distinct from `POSTHOG_API_KEY`.
3. Ensure connected-repository Workers Builds retain `.git` metadata. Manual staging or production deployments must run from a real release checkout rather than a source archive so uploaded symbol sets can be associated with the deployed commit.

## What error tracking does now

Uncaught browser errors and unhandled promise rejections are captured by the PostHog JavaScript SDK's built-in exception autocapture. It is enabled centrally with `capture_exceptions: true` in `src/lib/analytics/events.ts`, and remains behind the app's existing analytics enablement and consent gates. No duplicate global error handlers or scattered manual captures were added.

The app already has a centralized PostHog SDK initializer; this run enabled exception autocapture there. The source-map uploader was added as a build dependency and configured in `vite.config.ts`.

## Source-map uploads

Source-map upload is wired into the Vite production build. The changed files for this wiring are:

- `vite.config.ts`
- `package.json`
- `package-lock.json`
- `docs/deployment.md`

The exact production build/deploy command is:

```sh
npx convex deploy --cmd 'npm run build'
```

Vite runs inside that command before Wrangler deploys the artifact. Every production build using the configured credentials uploads its source maps, then removes the uploaded map files. The uploader uses `POSTHOG_API_KEY`, `POSTHOG_PROJECT_ID`, and `POSTHOG_HOST`; these names are required in the Cloudflare Workers Builds environment.

## Verify it

Trigger an error in the deployed app, then open [PostHog Error Tracking](https://eu.posthog.com/project/280184/error_tracking). Uploaded symbol sets are shown in [Error Tracking configuration](https://eu.posthog.com/project/280184/error_tracking/configuration).
