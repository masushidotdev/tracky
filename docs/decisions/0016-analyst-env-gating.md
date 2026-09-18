# Analyst frontend environment gate

Status: accepted

## Context

The AI Analyst section needs an explicit per-environment opt-in. Hiding a
navigation entry alone would still allow the chat to mount through a saved URL.
This change controls frontend availability without changing Convex behavior.

## Decision

`isAnalystEnabled()` reads `import.meta.env.VITE_ANALYST_ENABLED` and returns true
only for the exact string `true`. An absent flag or any other value disables the
section. Vite substitutes `VITE_*` values at build time: changing the deployed
frontend requires a rebuild with the new value. This flag is public, not a secret.
The env example explicitly opts in; omission remains disabled by default.

`analystNavItem` is shared by the footer and navigation catalog. `allNavItems`
remains complete; the sidebar and command palette filter their rendered entries.
Direct access to `/app/analyst`, including a thread query, renders a localized
disabled page without mounting `AnalystView` or `PanelErrorBoundary`.

Both EN and IT define `analyst.disabled.title` and
`analyst.disabled.description`. The title is “Feature disabled” / “Funzionalità
disabilitata”; the description is “The AI Analyst is not enabled in this
environment.” / “L'Analyst AI non è abilitato in questo ambiente.” The description
is also shown in the page body. `TranslationKey` derives from EN, and typed IT
lookup requires those EN keys; the runtime interpolation fallback remains unchanged.

## Boundary

This is a frontend gate, not an authorization or spending control. Direct Convex
calls remain possible under existing authorization. Backend jobs, Telegram,
notifications, and settings are unaffected. A backend gate is outside this change.
