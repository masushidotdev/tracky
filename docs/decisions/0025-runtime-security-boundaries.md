# 0025 — Runtime patch ownership and dependency compatibility

Status: Accepted

## Decision and reason

Use Node 22.23.4 as the repository tooling/build baseline. Production verification after PR #55 observed Convex Node 22.23.2 even after selecting major 22. Since the provider owns patch executors, remove the application dependency on that runtime instead of waiting while handling remote responses on an unpatched binary. This follows the verified Redirections containment approach; Tracky has no posthog-node dependency.

All banking, account-deletion, Analyst, Telegram, embedding and report actions run in Convex's standard runtime. Sign Enable Banking JWTs with native Web Crypto RS256, retaining PKCS#1/PKCS#8 and existing encoded PEM configuration. Export Langfuse OTLP JSON with native fetch and the official OpenTelemetry serializer, keeping the Langfuse processor, per-generation attribution and financial-body exclusions. Native fetch avoids the Node HTTP/Brotli execution path; replacing a decoder request header alone would not prevent a malicious response.

`npm run security:convex-runtime` rejects Node directives and bundles application and installed component sources for the standard runtime before build/dev/deploy. It checks transitive dependencies as well as authored files, allowing only the AsyncLocalStorage/AsyncResource shim supported by Convex itself. The official [convex.json documentation](https://docs.convex.dev/config/convex.json#configuring-the-nodejs-version) supports major values 22 and 24, not a patch pin such as 22.23.4; the CLI passes a string and the server selects the executor. The retained major-22 fallback in convex.json is not a patched-executor claim and cannot be used while the policy gate is active. Reintroducing Node actions requires a new reviewed decision and freshly observed provider patch evidence.

Keep runtime diagnostics internal and read-only. Deployment evidence must show runtime convex/nodeVersion null; the capability probe signs and verifies only with an ephemeral synthetic key, never configured banking credentials. Incident log/key review and Cloudflare workerd provenance remain separate operational evidence.

Use current compatible dependency families without --force, legacy peer resolution or audit-result suppression. Keep TypeScript 6 until the ESLint stack supports its replacement and OpenTelemetry 2/API 1.9.1 until Langfuse supports the next family. These exceptions were reproduced by installing the latest releases. Remove the shadcn CLI dependency and preserve its licensed CSS because the latest CLI still carried an unpatched advisory and was unnecessary at runtime/build.

AI SDK telemetry integrations belong to individual generations and exclude financial request/result bodies. Shared global registration would risk attributing one request's data to another user. Technical attribution/usage remains available; application history and provider processing retain their separate roles.

Keep existing prefix indexes and monthly scheduling during this security update. Removing a prefix index may change sort order or pagination cursors; a deliberate migration audit must precede that change. See the [audit evidence and open operator actions](../security-audit-2026-10.md).
