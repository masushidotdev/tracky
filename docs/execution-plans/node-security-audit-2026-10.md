# Node and dependency security audit — 23 October 2026

Status: Implementation and local verification complete; production verification evidence is recorded in release PR #56. Incident response remains separate.

## Scope and assumptions

The user requested an in-depth review after a Stripe notice, all npm dependency updates, and a new worktree from main. The isolated branch is `codex/node-security-audit`, based on `4df262ac6940c716694149e84fa4135266c8896e` (also origin/main when fetched). At audit completion no production deployment or credential rotation had been performed. The user subsequently authorized direct production deployment and clarified the required path: push/merge to GitHub main, then the automatic Cloudflare pipeline. No staging or manual CLI deploy is part of this release. The notice names a separate Stripe account; no Stripe implementation was found in this repository. This does not establish which environment Stripe observed or whether any key was exposed.

## Phases

1. Confirm official Node advisories and map build, frontend, backend, component and external-provider runtimes.
2. Record the baseline dependency audit; update direct and transitive dependencies, adapting supported APIs without ignoring peer conflicts.
3. Pin patched local/build Node, configure the Convex Node major, inspect authorization, webhooks, provider boundaries and secret handling, and repair concrete issues.
4. Run clean install, audits, tests, frontend/backend type checks and Cloudflare builds; record limitations and required operator evidence.

## Initial findings

- Official Node release 22.23.4 fixes CVE-2026-111497 (Brotli RCE), plus DNS/TLS and other issues. npm audit cannot check the Node binary or hosted services.
- Both repository pins and the inherited shell were 22.23.2. The already-installed nvm 22.23.4 binary is used for this work.
- Baseline npm audit: 27 vulnerable package nodes (9 critical, 12 high, 6 moderate). These include propagated findings, not 27 distinct vulnerabilities. TanStack Start has a critical reflected-XSS advisory.
- Convex has real Node actions for banking, Analyst, telemetry and account deletion. `convex.json` did not select a Node major. Updating the npm client does not patch managed Node executors.
- Cloudflare serves SSR through workerd, with Node compatibility APIs; it also uses a separate Node build machine. Its compatibility date selects behavior, not security patches.
- The security policy incorrectly claimed there was no browser analytics and that only VITE_CONVEX_URL was public, despite consent-gated PostHog.

## Current Verification Evidence

### Initial local verification (before PR #55)

- Official sources reviewed: [Node October advisory](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases), [Convex runtimes](https://docs.convex.dev/functions/runtimes), [Convex Node configuration](https://docs.convex.dev/config/convex.json), [Cloudflare Node APIs](https://developers.cloudflare.com/workers/runtime-apis/nodejs/), [Workers build image](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/), [TanStack advisory](https://github.com/TanStack/router/security/advisories/GHSA-qx66-fv34-fjm8), [Stripe key rotation](https://docs.stripe.com/keys#rolling-keys).
- main and fetched origin/main matched at the base commit above. The starting worktree was clean.
- `npm ci --include=dev`: passed on Node 22.23.4 / npm 10.9.9, including actual preinstall/prepare scripts.
- `npm audit --json` and `npm audit --omit=dev --json`: zero critical, high, moderate, low or informational findings.
- `npm test`: 137 files and 1,033 tests passed. Coverage includes existing ownership/erasure/callback tests and new provider-origin/redirect, Resend rejection, response-header, table-state and telemetry-isolation tests.
- `npm run lint`: passed; now checks both frontend and Convex TypeScript before ESLint.
- `CLOUDFLARE_ENV=staging npm run build`: passed; CSS source-map warning remains non-blocking.
- Compiled local workerd preview with fake WorkOS configuration: `/` 200 and `/app` 307, security headers present, cookies preserved. The preview was stopped and fake files removed.
- Runtime guard rejects 22.23.2, accepts 22.23.4 and later Node 22 patches, rejects other majors to preserve the supported project baseline.
- npm dependency inspection found no invalid/missing peers. npm 10 reports seven extraneous platform/WASM/PostHog-bundled installation artifacts after clean install; these are recorded, not mistaken for vulnerable dependencies.
- Limited current-tree/history secret-pattern scan: no matches; this is not forensic clearance. Browser JS/maps contained none of the checked backend secret variable names.
- Cloudflare deployment metadata read could not authenticate without an API token. No hosted runtime patch confirmation, live log audit, key rotation or deployment was performed.
- See [the detailed report and open response runbook](../security-audit-2026-10.md) for dependency versions, tested incompatibilities and provider obligations.

## Production release follow-through

- Authorized by the user after local verification; staging explicitly excluded.
- Release via a GitHub pull request merged to main, then observe the automatic Cloudflare production pipeline.
- Local Cloudflare token metadata checks were read-only and returned insufficient access to the Worker. No local deploy command was executed.
- PR #55 merged as fad29529e621800333b9503568fc31bd8dc7d3ab; build fb1979da succeeded and Worker 829fcaef served 100%. Home 200, protected /app 307, new security headers and asset hashes observed. Build and CodeQL green.
- Production diagnostic observed provider Node 24.21.0 during major rollout, then repeatedly 22.23.2. This is below 22.23.4 and cannot be fixed by installing npm packages.

## Convex runtime containment follow-up

The user required resolution after finding the same issue addressed in Redirections. Reading that session and its implementation established that it removed posthog-node and the only Node action; it did not patch the provider runtime. Tracky does not use posthog-node and has banking crypto, Langfuse telemetry and inherited Analyst/account-deletion action directives.

1. Branch codex/convex-runtime-containment from origin/main fad2952 in the existing isolated worktree.
2. Move every application action to the standard runtime. Preserve banking RS256 claims, PKCS#1/PKCS#8 and all existing PEM encodings using Web Crypto. Preserve 192-bit OAuth state.
3. Keep per-generation Langfuse/AI SDK attribution and input/output exclusions; use official OTLP JSON serialization with native HTTPS fetch, finite timeout, redirect rejection and byte-bounded batches. No Node HTTP/Brotli transport remains.
4. Add a build/dev/deploy source/import gate, bundling all app modules and four installed components for the standard runtime. Preserve only the AsyncLocalStorage shim documented and shipped by Convex.
5. Verify crypto against independent Node verification and in the edge test runtime; verify AI SDK-to-Langfuse synthetic transport without real model calls or financial bodies; run full tests, lint, audit and build.
6. Release through PR/main and automatic Cloudflare production pipeline only. Verify internal runtime convex/nodeVersion null and ephemeral RSA/state probe; no configured bank key, customer record or paid AI request is used by these probes.

The dormant nodeVersion 22 fallback stays explicit but is unusable while the gate is active. This is containment of the Node execution boundary, not a claim that Convex has patched its binary.


## Follow-up local verification

- All 1,044 tests in 141 files passed. Focused crypto, OTLP/AI SDK and extended synthetic telemetry capability tests also passed after the final changes.
- TypeScript frontend/backend and ESLint passed. Production build (CLOUDFLARE_ENV empty) passed, with the existing non-blocking CSS source-map warning.
- Runtime gate compiled 153 application sources plus all four component directories (1,093 bundled inputs). A temporary source containing an actual Node directive was rejected; the fixture was removed.
- Full npm audit remains at zero known vulnerabilities. Three already-locked packages are declared directly for the new serializer/gate; existing dependency versions are unchanged.
- Read-only production standard-runtime inspection confirmed availability of Web Crypto generate/import/sign, AbortSignal.timeout, fetch, performance.now/timeOrigin, TextEncoder and base64 APIs before release.
- Exact nodeVersion patch selection is not a supported setting in the current official docs; supported values are 22 and 24. The installed CLI schema describes those values but accepts an unrestricted string locally, so merely passing local JSON validation would not establish server support.

- Initial PR CI caught the repository requirement for the exact heading Current Verification Evidence after it was renamed to distinguish historical checks. The heading is restored; no policy/test suppression was introduced.
