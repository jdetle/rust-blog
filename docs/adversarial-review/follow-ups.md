# Adversarial Review — Open Follow-Ups

Canonical list of open follow-up actions surfaced by adversarial reviews. Each item links to the originating review. Mark done inline with `[x]` and move to the Closed section.

The gate rule scans this file (and the `followup:` lines in `TLDR.md`) before each push and surfaces any items related to files in the current diff.

---

## Open

- [ ] Update Azure App Service application settings with `BLOG_SERVICE_URL` — owner: author — trigger: `ca-rust-blog` blog-service deploy goes live — [2026-04-17-blog-service-consolidation-avatar-e2e](./reviews/2026-04-17-blog-service-consolidation-avatar-e2e.md)
- [ ] Rename `/v1/info` service field from `"rust-api"` to `"blog-service"` — owner: author — trigger: first full deploy of blog-service — [2026-04-17-blog-service-consolidation-avatar-e2e](./reviews/2026-04-17-blog-service-consolidation-avatar-e2e.md)
- [ ] Teardown orphaned Azure Container Apps (`ca-rust-api` in `rg-rust-blog`, `analytics-ingestion` in `rg-jdetle-blog`) — owner: author — trigger: blog-service smoke passes — [2026-04-17-blog-service-consolidation-avatar-e2e](./reviews/2026-04-17-blog-service-consolidation-avatar-e2e.md)
- [ ] Wire DNS / public URL for rust-api — owner: author — trigger: promoting beyond smoke test — [2026-04-16-rust-api-framework-deploy](./reviews/2026-04-16-rust-api-framework-deploy.md)
- [ ] Drop legacy `NEXT_PUBLIC_ANALYTICS_API_URL` in production env — owner: author — trigger: confirmed nothing reads the legacy var — [2026-04-14-analytics-ingestion-url-env](./reviews/2026-04-14-analytics-ingestion-url-env.md)
- [ ] Verify `cqlsh` ALTER on production keyspace for avatar schema migration — owner: author — trigger: analytics-ingestion / blog-service deploy — [2026-04-14-who-avatar-push](./reviews/2026-04-14-who-avatar-push.md)
- [ ] Optional narrow-mobile visual pass if CTA row feels crowded — owner: author — trigger: any mobile-layout complaint — [2026-04-16-marketability-nav-ctas](./reviews/2026-04-16-marketability-nav-ctas.md)
- [ ] Optional e2e when analytics env absent — owner: author — trigger: env-less CI run — [2026-04-14-home-hero-fingerprint-avatar](./reviews/2026-04-14-home-hero-fingerprint-avatar.md)
- [ ] Human review pass on Guardian post; verify claims against current README — owner: author — trigger: next edit session on the post — [2026-04-14-guardian-post-ai-draft](./reviews/2026-04-14-guardian-post-ai-draft.md)
- [ ] Optional visual regression on home for entrance motion differences — owner: author — trigger: user-reported motion complaint — [2026-04-01-animated-frame-mobile-first-paint](./reviews/2026-04-01-animated-frame-mobile-first-paint.md)
- [ ] Optional mobile visual pass on home — owner: author — trigger: mobile layout complaint — [2026-04-14-home-recent-who-push](./reviews/2026-04-14-home-recent-who-push.md)
- [ ] Refresh `/work-with-me` copy if employment situation changes — owner: author — trigger: employment change — [2026-04-16-work-with-me-capacity-approval](./reviews/2026-04-16-work-with-me-capacity-approval.md)

---

## Closed

_None yet. Move items here with `[x]` and a closed date when complete._
