# 0025 — Runtime patch ownership and dependency compatibility

Status: Accepted

## Decision and reason

Patch the Node build/local executable separately from Convex Node actions and Cloudflare workerd. Use Node 22.23.4 as the repository baseline and select Convex major 22 explicitly, because installing a new npm SDK cannot update hosted executor binaries. Keep an internal read-only runtime inspection; never expose env or runtime diagnostics publicly. Managed patch confirmation and incident log/key review are operational release evidence, not conclusions from npm audit.

Use current compatible dependency families without --force, legacy peer resolution or audit-result suppression. Keep TypeScript 6 until the ESLint stack supports its replacement and OpenTelemetry 2/API 1.9.1 until Langfuse supports the next family. These exceptions were reproduced by installing the latest releases. Remove the shadcn CLI dependency and preserve its licensed CSS because the latest CLI still carried an unpatched advisory and was unnecessary at runtime/build.

AI SDK telemetry integrations belong to individual generations and exclude financial request/result bodies. Shared global registration would risk attributing one request's data to another user. Technical attribution/usage remains available; application history and provider processing retain their separate roles.

Keep existing prefix indexes and monthly scheduling during this security update. Removing a prefix index may change sort order or pagination cursors; a deliberate migration audit must precede that change. See the [audit evidence and open operator actions](../security-audit-2026-10.md).
