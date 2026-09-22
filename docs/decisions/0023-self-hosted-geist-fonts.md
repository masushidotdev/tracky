# 0023: Self-hosted Geist via public/fonts

Status: accepted

## Decision

Geist Variable ships as two `latin`/`latin-ext` `@font-face` blocks in
`src/app.css` pointing at `/fonts/*.woff2` files committed under
`public/fonts/`. The bare `@import '@fontsource-variable/geist'` (all five
latin/cyrillic/vietnamese subsets) is not used, and the `?url` stylesheet
link in `src/routes/__root.tsx` stays untouched. `public/fonts/` holds only
the two served woff2 files.

## Reason

Production served a broken `assets/files/geist-*-wght-normal.woff2` URL for
every weight (console 404, body text fell back to system sans). Root cause:
tailwind's postcss step inlines the fontsource `@import` before vite sees
it and rewrites its relative `url(./files/…)` to an absolute filesystem
path; vite then leaves that path unresolved and emits it verbatim into the
bundle. Verified with an isolated postcss→vite repro, not from the error
text alone. Moving the files to `public/` keeps the URL absolute and
vite-independent, and `latin`+`latin-ext` covers the EN/IT corpus.

## Constraint

Do not re-add a bare fontsource `@import` with relative `url()` into a CSS
entry processed by tailwind postcss. If more subsets are needed, add the
`@font-face` block + woff2 under `public/fonts/` instead.
`convex/architecture-invariants.test.ts` fails on a fontsource geist
`@import` in `src/app.css` and on missing `public/fonts/*.woff2` files.
