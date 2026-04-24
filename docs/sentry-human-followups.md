# Sentry — human follow-ups (not automated)

These items need a person with access to Sentry, Azure Key Vault, and GitHub secrets.

1. **Production secrets** — Confirm `NEXT_PUBLIC_SENTRY_DSN` and `SENTRY_AUTH_TOKEN` are set for frontend CI/deploy, and `rust-sentry-dsn` (or equivalent) maps to `SENTRY_DSN` for `blog-service`. Rotate tokens if they were ever pasted into chat or logs.

2. **Post-deploy smoke** — In staging or production, trigger a harmless error (or use the example routes with `SENTRY_ENABLE_EXAMPLE_ROUTES=true`) and verify the issue appears in the correct Sentry project with environment and release tags you expect.

3. **Source maps** — If stack traces are minified in the Next.js project, confirm releases/uploads in Sentry and that CI is not silencing plugin failures you care about (`silent: !process.env.CI` in `next.config.ts`).

4. **Browser policy** — Review CSP `connect-src` and any WAF rules so same-origin `/monitoring` (tunnel) is allowed; ad blockers will still block direct `*.sentry.io` calls from users who bypass the tunnel.

5. **Alerting** — Add org-level checks for sustained zero events or error-rate spikes per project, so a total outage of telemetry is visible.

6. **agentdds repo** — Repeat the same secret, deploy, and smoke checklist for that codebase when it is in scope; this repository’s tests do not cover other repos.
