# 0019: TanStack devtools dev-only

Status: accepted

## Decision

TanStack devtools load only in development: `src/routes/__root.tsx` renders a
`React.lazy` panel gated on `import.meta.env.DEV`, with the real imports
(`@tanstack/react-devtools`, `@tanstack/react-form-devtools`) isolated in
`src/components/devtools.tsx`. The production branch is a static `null`
component, so Vite never emits or fetches the devtools chunk in prod builds.

No `devtools()` Vite plugin option is used (no such plugin is configured);
the `import.meta.env.DEV` ternary is statically analyzable, so the dead
branch is dropped at build time. Same shape as 0016 (Analyst env gating):
dev-only code behind a build-time constant, not a runtime check.

## Reason

The panel was statically imported in the root route, so it shipped to
`trytracky.app` as a visible floating button (screenshot: TanStack Devtools
bar with empty SEO previews). Devtools are devDependencies but bundlers
follow the import graph, not the dependency table.

## Constraint

New TanStack devtools plugins go in `src/components/devtools.tsx` only.
`convex/architecture-invariants.test.ts` fails on any other
`@tanstack/*devtools` import in `src/` and on a root route missing the
`import.meta.env.DEV` gate.
