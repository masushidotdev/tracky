# Security audit — Node, Convex and Cloudflare

Reviewed: 23 October 2026. Repository base: `4df262a` on main.

## Outcome and limits

The first remediation was deployed through PR #55 as fad2952; Cloudflare served Worker 829fcaef at 100% and the fresh build used Node 22.23.4. Production inspection found Convex Node 22.23.2, below the patch baseline. The follow-up removes all application Node actions and verifies the standard-runtime boundary before build. The initial npm audit reported 27 vulnerable package nodes: 9 critical, 12 high, 6 moderate. The updated tree reports zero known advisories. Propagated package findings are not independent CVEs, and a clean npm audit cannot certify a Node binary, managed service, key exposure or absence of compromise.

The first production deploy completed through main and its Cloudflare pipeline; no staging deploy, key rotation or customer-record change was performed during verification. No Stripe code, SDK dependency or Stripe environment variable was found in the tracked application. The supplied email refers to an account named Redirections; the repository alone cannot identify which workload generated that telemetry. The email's origin has not been authenticated from the pasted text. Treat the incident response as open until the affected account/workload and provider evidence are reconciled.

## Runtime threat model

| Surface | Evidence and exposure | Repository mitigation | Remaining evidence |
| --- | --- | --- | --- |
| Developer/build Node | Inherited shell and both pins were 22.23.2. Node 22.23.4 was already installed in nvm. npm, CLI downloads, font/OG generation and provider SDK traffic can process external data. | Both pins now 22.23.4; engines >=22.23.4 <23, engine-strict, preinstall/build/dev/deploy guards and bootstrap guard. All verification uses the installed nvm 22.23.4 binary. | Restart old dev processes and terminals. Rebuild on a clean trusted machine if compromise is suspected. No machine-forensics clearance is claimed. |
| Workers Builds | Independent Node machine; dashboard NODE_VERSION can override repository version files. Build credentials include deploy and source-map-upload keys. | Correct version files and fail-fast guards; locked npm install and CI dependency audit. | First production build fb1979da confirmed Node 22.23.4. Keep checking the version in subsequent fresh build logs. |
| Cloudflare SSR | TanStack Start executes on workerd with Node compatibility APIs, not the local Node executable. Compatibility date is 2026-07-01. | Updated Cloudflare Vite plugin/Wrangler/local workerd; fixed framework dependencies and added dynamic-response protections. Compatibility date deliberately unchanged to avoid unrelated API changes. | Cloudflare must establish deployed runtime/Brotli patch status. Node compatibility and npm versions alone cannot establish immunity. Authenticated dashboard evidence verified the first production Worker release; this does not attest Cloudflare runtime patch provenance. |
| Convex default functions/components | Database queries, mutations and HTTP webhooks use Convex's custom JS runtime. Installed Agent, Rate Limiter, Resend and WorkOS component source contains no Node directives under its component directories. | Updated SDK/components and app env declarations; preserve server-side WorkOS identity and internal operation boundaries. | Components were published by the main pipeline. The runtime policy bundles all four installed components for the standard runtime. |
| Convex action runtime | First production inspection observed provider Node 24.21.0 during rollout, then 22.23.2. Neither meets the October patch baseline. Tracky has no posthog-node dependency; its boundaries were banking crypto, telemetry and inherited action directives. | Remove all Node directives. Banking signs with Web Crypto; Langfuse uses the official OTLP serializer over bounded HTTPS fetch. Build gate rejects Node actions and incompatible transitive imports in app/components. | Deploy this containment through main and confirm runtime convex/nodeVersion null plus the synthetic signing probe. The repository does not claim to patch the provider executable. |
| Browser and rendering | Browsers do not run this project's Node. Framework server-function responses and rendered model output have their own XSS risks. | Patch TanStack Start, React, seroval and DOMPurify; preserve approval gates and user ownership. | Authenticated end-to-end checks with real service configuration remain necessary. |

The [Node security advisory](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases) confirms CVE-2026-111497 (Brotli RCE), DNS/TLS validation problems and additional fixes. The selected baseline is 22.23.4. Patching dependencies does not replace patching the executable; lack of an explicit Brotli import does not remove SDK/network decoder exposure.

The verified local binary reports Node 22.23.4, OpenSSL 3.5.9, and Brotli 1.1.0. A security fix can be cherry-picked without changing the library version string. Do not reject or approve a runtime solely by comparing `process.versions.brotli`; retain Node build provenance and provider patch confirmation.

[Convex runtime boundaries](https://docs.convex.dev/functions/runtimes), [Convex Node major selection](https://docs.convex.dev/config/convex.json), [Cloudflare Node compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/), [Cloudflare zlib/Brotli APIs](https://developers.cloudflare.com/workers/runtime-apis/nodejs/zlib/) and [Workers Builds version selection](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/) support these distinctions. No provider-specific incident assurance was obtained. The containment removes application selection of the Node executor; it is not a provider-wide patch claim.

## Dependency changes

Direct production and development dependencies were checked against registry stable releases, and the transitive graph was regenerated. Versions that were already current remain unchanged. Important lockfile changes:

| Package | Before | After |
| --- | --- | --- |
| convex | 1.46.0 | 1.48.0 |
| @convex-dev/agent | 0.6.4 | 0.7.8 |
| @convex-dev/rate-limiter | 0.3.2 | 0.4.2 |
| @convex-dev/resend | 0.2.8 | 0.2.10 |
| @convex-dev/workos-authkit | 0.2.9 | 0.2.10 |
| @workos/authkit-tanstack-react-start | 0.11.1 | 0.12.0 |
| @tanstack/react-start | 1.168.56 | 1.169.4 |
| @tanstack/start-server-core | 1.169.37 | 1.169.45 |
| react | 19.3.0 | 19.3.1 |
| ai | 6.0.224 | 7.0.150 |
| @langfuse/otel | 5.11.1 | 6.0.2 |
| @cloudflare/vite-plugin | 1.56.0 | 1.65.0 |
| wrangler | 4.135.0 | 4.152.0 |
| workerd | 1.20260918.1 | 1.20261019.1 |
| miniflare | 5.20260918.0-alpha | 5.20261019.2-beta |
| vite | 8.3.0 | 8.3.5 |
| vitest | 4.1.11 | 5.0.5 |
| dompurify | 3.4.15 | 3.4.17 |
| seroval | 1.6.7 | 1.7.1 |
| undici | 7.29.0 | 7.30.1 |
| sharp | 0.35.4 | 0.35.5 |
| proxy-addr | 2.0.7 | removed |
| shadcn | 4.21.0 | removed |

TanStack's [reflected-XSS advisory](https://github.com/TanStack/router/security/advisories/GHSA-qx66-fv34-fjm8) was directly relevant to server-function responses. Other baseline findings included MCP SDK, DOMPurify, seroval, solid-js, proxy-addr, sharp, undici, Vite and Vitest; they were patched or removed through the refreshed graph. See the installed lockfile for exact nested versions.

Compatibility decisions:

- Convex Agent 0.7 and AI SDK 7 are upgraded together. The supplied migration guide says old 0.6 messages remain readable; no message data migration is introduced. The SDK model registry is bounded to the application's existing model IDs to avoid an upstream constructor union-complexity limit. Model choices are unchanged.
- TypeScript stays at the latest compatible 6.0.3 line (`~6.0.3`). Installing 7.0.2 caused ts-api-utils/ESLint to crash while accessing `Intrinsic`. This is a verified compatibility exception, not an ignored audit finding. `@types/node` stays on the latest 22 line matching the runtime.
- Langfuse 6 requires OpenTelemetry core/trace-base 2.x. API 1.9.1 and trace SDK 2.12.0 are retained; OTLP packages are explicitly 0.223.0, because 0.300.0 pulls 3.x with incompatible API peers. The deprecated sdk-trace-node wrapper and unused Langfuse tracing dependency are removed. No forced or legacy peer resolution is used.
- Shadcn 4.22.1 still pulled the unpatched braces advisory through its CLI graph (7 propagated high package findings). The app imported only its Tailwind CSS. That exact stylesheet and the upstream MIT license are vendored under src/styles; the CLI graph is removed. No unsupported override or automatic downgrade to shadcn 1.0.0 is used.
- Table 9 uses explicit features and controlled state with automatic core row models. A React regression test verifies selection, server order, column visibility, sizing and data replacement. No deprecated compatibility adapter is retained.
- Svix is declared explicitly because convex/http.ts directly imports it. Previously that import depended on transitive hoisting.

## Critical boundary review and fixes

### Identity and data isolation

A static inventory covered 229 direct public query/mutation/action registrations. Every inventoried body uses the centralized auth helper or explicit AuthKit/identity handling. This is a triage check, not a formal proof of authorization for every path. Source review additionally traced public banking actions, thread reads/writes/approvals, account deletion and internal provider queries. Client arguments do not provide user IDs for authorization; thread/account ownership is checked before access. Sensitive work remains internal. Existing ownership, erasure-race, callback-idempotency, quota and approval tests are retained.

WorkOS webhook verification remains in the upgraded AuthKit component. Its test webhook mutation no longer accepts an apiKey argument, so fixtures were updated to its real validator. CSRF middleware remains enabled for Start server functions. WorkOS session/cookie configuration is still a hosted-secret obligation; no real login/session revocation was exercised.

### HTTP and rendering

Start request middleware sets nosniff, DENY framing, no-referrer, a structural CSP (frame ancestors/base URI/object restrictions), and private/no-store on dynamic responses. Even public SSR can contain authenticated state, so it must not be cached across users. Hashed static assets retain independent asset handling. The CSP deliberately does not claim script-level XSS prevention; dependency patching remains necessary. Production UI error fallback no longer renders stack traces.

The banking OAuth callback's 303 previously omitted Referrer-Policy on the assumption that redirects need no security headers. Redirect policy controls the next navigation too; the response now suppresses Referer and retains existing fixed return-URL validation. Regression coverage checks that the authorization code is absent from the destination.

Resend requires a configured signing secret and verified Svix signature before dispatch. Missing configuration returns 503; invalid signatures return 401. Telegram checks the secret header, JSON content type, body size, private-chat and linked-account eligibility. No inbound webhook depends on the frontend's Cloudflare Access gate.

### Credential destinations and telemetry

Enable Banking now validates an HTTPS API base without embedded credentials/query/fragment, rejects request paths escaping its origin, forbids redirects and bounds requests to 30 seconds. The base is operator configuration, not a client URL; arbitrary outbound user-URL fetching was not introduced. These protections reduce misconfiguration/replay risk but do not replace a patched managed Node executor. Other external calls use configured/fixed WorkOS, Telegram, AI Gateway, OpenRouter and Langfuse destinations.

Backend env names are explicitly declared as optional strings; application reads use the generated env object. Existing per-feature validation preserves fail-closed behavior for missing signing secrets and disabled integrations. Test fixtures may still manipulate process.env. The new duplicate-index rule is disabled only for the existing schema because removing prefix indexes can change creation-time ordering and cursors; an index migration is outside this incident fix. Existing monthly cron timing is likewise preserved with a localized lint explanation.

AI SDK telemetry uses a per-generation OpenTelemetry integration/provider, disables prompt/tool/output recording and shuts the provider down after flushing. User/thread identifiers, model, timing and usage can still be exported. There is no global registration carrying identity across requests. This affects optional Langfuse traces, not persisted chat history or data AI providers need to fulfill requests. SECURITY.md's stale claims about browser analytics and public VITE variables were corrected; both user-doc languages describe the current behavior.

### Regression found during upgrades

Updated convex-test enforces the platform's single `.paginate()` call per query. Reports previously paginated in a loop and would fail beyond one page. Indexed async iteration now preserves the 25,000-row limit and uses one extra row to establish truncation. Two clock assertions were adapted to Convex's monotonic transaction clock rather than assuming every transaction shares the same frozen millisecond.

## Verification evidence

Final commands passed under Node 22.23.4: clean `npm ci --include=dev`, complete `npm test` (137 files / 1,033 tests), `npm run lint` (frontend + backend TypeScript and ESLint), and `CLOUDFLARE_ENV=staging npm run build`. Both full-tree and production-only npm audits report zero advisories. The build retains a CSS source-map warning; it does not block compilation.

A compiled workerd preview with fake local WorkOS values served `/` as 200 and `/app` as a 307 sign-in redirect. Both carried private/no-store, structural CSP, no-referrer, nosniff and DENY framing; cookies and streaming HTML remained intact. No actual login or financial service was contacted. Fake preview configuration was removed afterwards. Without WorkOS configuration, the middleware fails closed with a generic 500, so real deployment secrets are required for the full smoke test.

A limited current-tree/history scan for common private-key, Stripe-secret and GitHub-token patterns produced no matches; this is not an exhaustive credential or forensic scan. No backend secret variable names appeared in the generated browser JS/maps. `npm ls --all` found no missing/invalid peers; npm 10 still reports seven extraneous platform/WASM or PostHog-bundled files even after a clean install. They are installation-artifact findings, not audit advisories, and are not hidden by force/legacy flags.

See the execution plan for verification boundaries and operational follow-up. Tests and builds are local, synthetic and secret-free. There is no claim that production was patched, that historical logs were reviewed, or that a credential was unexposed. The public auth/AI/banking flows require a configured staging smoke test before release.

## Operator response runbook (still open)

1. Identify the exact Stripe account and the workload/IP/key involved in the notice using its dashboard directly. Review [Stripe request logs](https://docs.stripe.com/development/dashboard/request-logs), unfamiliar calls, payouts, settings changes and key last-use metadata. Tracky has no discovered Stripe integration; inspect the Redirections workload independently.
2. Preserve access/build/auth/provider logs and deployment metadata for at least the seven-day telemetry window before the notice, extending to remediation. Inspect unusual requests, crashes, executor/build activity, outbound destinations and credential use. Preserve evidence before clearing caches or rebuilding; absence of a logged event is not evidence of no compromise.
3. Secure each affected host/build/runtime before provisioning replacement credentials. Restart old local processes, use a trusted clean checkout and `npm ci`, clear remote dependency/build caches, confirm Node in fresh Workers Builds logs, and deploy updated functions/components and the Worker. If a machine is suspected compromised, recreate it from a trusted image; this repository update does not clean that machine.
4. Verify the application no longer selects Convex Node after the containment deploy: run the internal `securityRuntime:inspect` and `securityRuntime:verifyCapabilities` with `--prod`. Expect runtime convex/nodeVersion null and successful ephemeral-key RSA verification/stateBytes 24. The source/import gate must also pass. Any future reintroduction of Node requires fresh executor patch evidence. Obtain Cloudflare workerd/Brotli confirmation separately; a compatibility-date bump is not proof.
5. After securing the environment, [rotate the affected Stripe keys](https://docs.stripe.com/keys#rolling-keys), update only the relevant secret stores, validate the integration and expire old keys. Do not paste keys into chat, command histories or reports. Assess every credential reachable from a potentially compromised process: WorkOS keys/cookie password, banking signing key, Convex deploy/access keys, Cloudflare token, AI Gateway/OpenRouter, Telegram bot/webhook, Resend/webhook, Langfuse and PostHog uploader. Scope rotation to actual exposure and coordinate cookie/session invalidation and webhook re-registration where needed.
6. Validate sign-in/callback/logout and unauthenticated guards in production after the authorized main pipeline. Exercise bank consent/sync, Analyst approvals, notifications and erasure only with explicit synthetic-account scope; no destructive customer flow is part of this release verification. Preserve merge/build IDs. Continue reviewing provider and Stripe logs after rotation. Close only when deployment/runtime and incident-response evidence is recorded.

No outgoing messages were sent, no provider accounts were modified, and no key material was read or included in this report.
