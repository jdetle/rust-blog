# Adversarial review — Sentry + Next.js

---
date: 2026-04-23
slug: sentry-nextjs
mode: diff-audit
status: proceed
scope: .env.example, .github/workflows/deploy-frontend-azure.yml, app/api/sentry-example-api/route.ts, app/global-error.tsx, app/sentry-example-page/page.tsx, bun.lock, instrumentation-client.ts, instrumentation.ts, next.config.ts, package.json, sentry.edge.config.ts, sentry.server.config.ts
diff_base: origin/main
veto_fired: false
follow_up_open: true
caught_real_issue: pending
---

**Date:** 2026-04-23  
**Branch:** `feat/sentry-nextjs`  
**Scope:**

```
 .env.example                                |  11 +
 .github/workflows/deploy-frontend-azure.yml |  12 +
 app/api/sentry-example-api/route.ts         |   5 +
 app/global-error.tsx                        |  23 +
 app/sentry-example-page/page.tsx            |  43 +
 bun.lock                                    | 491 +++++++++++++++++-
 instrumentation-client.ts                   |  16 +-
 instrumentation.ts                          |  12 +
 next.config.ts                              |   9 +-
 package.json                                |   1 +
 sentry.edge.config.ts                       |   6 +
 sentry.server.config.ts                     |   6 +
 12 files changed, 629 insertions(+), 6 deletions(-)
```

## Offense

- **Shipped example fault injection in prod by default:** `app/sentry-example-page/page.tsx` and `app/api/sentry-example-api/route.ts` always throw or expose triggers; any crawler or user hitting `/sentry-example-page` creates Sentry noise and a poor UX surface. Evidence: new routes in the diff, no `robots` or env gate in the original commit.
- **Workflow path glob may miss Sentry config edits:** `.github/workflows/deploy-frontend-azure.yml` uses `sentry.*.ts`; GitHub `paths` matching can be subtle for multi-dot filenames (`sentry.server.config.ts`). Evidence: line 44 in workflow file — risk of **no frontend deploy** when only Sentry config changes.
- **`global-error` used `statusCode={0}`:** Next’s `next/error` is intended for HTTP status semantics; `0` is non-standard and may confuse monitoring or caching. Evidence: `app/global-error.tsx` in diff.
- **`sendDefaultPii: true` on the client:** `instrumentation-client.ts` enables default PII for Sentry while `.env.example` documents `SENTRY_SEND_DEFAULT_PII=false` for the Rust binary — inconsistent privacy posture for a public blog. Evidence: `instrumentation-client.ts` vs `.env.example` Rust section.

## Defense

- **Example routes:** Mitigated by a **production gate** — `SENTRY_ENABLE_EXAMPLE_ROUTES=true` required in production; dev remains unrestricted. API returns **404** when disabled; page uses a **server `layout.tsx`** with `notFound()`.
- **Workflow paths:** Mitigated by replacing the ambiguous glob with explicit `sentry.server.config.ts` and `sentry.edge.config.ts` entries.
- **Global error:** Mitigated by using **`statusCode={500}`** and restoring the `digest` typing expected by Next for error boundaries.
- **PII:** Left `sendDefaultPii: true` unchanged (replay/session correlation) but **documented** in `.env.example` under the Next public Sentry vars so the tradeoff is explicit; tightening to `false` is a one-line product call.

## Synthesis

**Decision:** Proceed — Sentry integration is proportionate; example routes must not be live in production without an explicit opt-in.

**Unresolved risk:** If `SENTRY_AUTH_TOKEN` is missing in GitHub Actions, source map upload may be degraded; `silent: !process.env.CI` limits log spam but releases may lack symbols until secrets are set.

**Follow-up:** [ ] author — confirm `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_AUTH_TOKEN` exist as repo secrets for `deploy-frontend-azure`; smoke one error after deploy.

**Note:** During review, the working tree had a **hardcoded DSN** in `instrumentation-client.ts` (not part of `origin/main...HEAD`). That file was reset to `HEAD` and must never be committed with real credentials — use `NEXT_PUBLIC_SENTRY_DSN` only.
