# Authentication & Profile Bootstrap

## Sub-features

- Unauthenticated route guard on `/_authenticated` (`src/routes/_authenticated.tsx`): redirects `/app` (and all `/app/*` routes except `/app/settings/deleting` -> `/`) with HTTP `307` to `https://api.workos.com/user_management/authorize?...`.
- WorkOS AuthKit callback (`/callback`, `src/routes/callback.tsx`).
- Post-login `ProfileBootstrap` (`src/components/auth/profile-bootstrap.tsx`) syncing the WorkOS user profile into Convex before app queries execute.

## How to get to it (user POV)

1. Visit `/app` while signed out -> browser redirects to WorkOS AuthKit hosted login.
2. Complete WorkOS login/sign-up -> redirected to `/callback` -> lands on `/app` Dashboard (`nav.dashboard`).

## Driving it with Playwright / curl

- **Unauthenticated guard (no real secrets required, synthetic `.dev.vars` only):**
  - `curl -sS -D - -o /dev/null http://127.0.0.1:4173/app`
  - Expect `HTTP/1.1 307` and `Location: https://api.workos.com/user_management/authorize?...`.
  - `curl -sS -D - -o /dev/null http://127.0.0.1:4173/app/settings/deleting`
  - Expect `HTTP/1.1 307` redirecting to `/` (not WorkOS).
- **Authenticated sign-in (requires real `.env.local`, `.dev.vars`, and `npm run dev` on `http://localhost:3000`):**
  1. Launch Playwright headed or reuse `/tmp/tracky-auth-state.json`.
  2. Navigate to `http://localhost:3000/app`.
  3. Complete WorkOS AuthKit credentials on `api.workos.com` (first run only; save `context.storageState({ path: '/tmp/tracky-auth-state.json' })`).
  4. Wait for URL `/app` and sidebar text `Tracky` + `Add Account` button to appear (`ProfileBootstrap` completed).

## Gotchas

- Automated login against WorkOS AuthKit cannot run without real WorkOS dev credentials (`WORKOS_CLIENT_ID`, `WORKOS_API_KEY`) and a configured `http://localhost:3000/callback` redirect URI in the WorkOS dashboard, plus a live Convex deployment (`VITE_CONVEX_URL`).
- Synthetic `.dev.vars` only tests that the `307` redirect is constructed with the right client ID and return pathname; submitting the WorkOS hosted form with a synthetic `client_id` fails on WorkOS.
- Automated sign-up also requires an active test email inbox (e.g., `ListEmailInboxes` enabled) or an existing `/tmp/tracky-auth-state.json`; if email inboxes are disabled, stop rather than inventing an address.
- `http://localhost:3000/callback` is accepted by the `tracky-woozy-antelope-583-dev` AuthKit app (verified HTTP `200` `Sign in` screen with cookies via `curl -c/-b -L`), whereas bare `google-chrome --headless=new --screenshot` on `/app` can show `Server Error` or stall on WorkOS AuthKit assets; use Playwright or an interactive browser session for AuthKit sign-in.
