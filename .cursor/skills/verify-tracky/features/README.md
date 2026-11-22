# Tracky Verification Feature Map

| Feature | Auth required | Primary route(s) | Guide |
| --- | --- | --- | --- |
| Public marketing & SEO routes | No (synthetic `.dev.vars` for local preview) | `/`, `/it/`, `/pricing`, `/faq`, `/robots.txt`, `/sitemap.xml` | [public-marketing.md](public-marketing.md) |
| Authentication & profile bootstrap | WorkOS dev credentials | `/app`, `/callback` | [auth-and-onboarding.md](auth-and-onboarding.md) |
| Accounts & loans creation | Yes (WorkOS + Convex) | Sidebar `Add Account`, `/app/settings/accounts`, `/app/loans/$facilityId` | [accounts-and-loans.md](accounts-and-loans.md) |
| CSV import wizard | Yes (WorkOS + Convex + 1 manual account) | `/app/import` | [csv-import.md](csv-import.md) |
| Zero-based Plan | Yes (WorkOS + Convex + 1 eligible account) | `/app/plan` | [zero-based-plan.md](zero-based-plan.md) |
