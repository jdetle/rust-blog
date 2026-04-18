# Adversarial Review TLDR

- [2026-04-17 site positioning: competent business professional + agentic coding](./2026-04-17-site-positioning-agentic-business.md)
  - decision: proceed (5-0) with Option A — 3 targeted PRs (lead-post hygiene, home repositioning, contact hygiene); no rebuild
  - unresolved risk: lead-post slot can today pick up `agentic-engineering-explained` (1-line draft) or `jdetle-guardian` (AI-default with caveat) and show them as the flagship post
  - follow-up: ship lead-post hygiene guard first (highest-leverage fix), then hero copy + CTA swap, then domain-aliased contact email

- [2026-04-17 blog-service consolidation + avatar e2e](./2026-04-17-blog-service-consolidation-avatar-e2e.md)
  - decision: proceed (5-0); rust-api + analytics-ingestion merged into blog-service; two test layers added
  - unresolved risk: orphaned Azure Container Apps (ca-rust-api, analytics-ingestion in rg-jdetle-blog) need manual teardown — see docs/runbooks/teardown-legacy-container-apps.md
  - follow-up: update Vercel env to BLOG_SERVICE_URL; rename /v1/info service field from "rust-api" to "blog-service" in follow-up PR

- [2026-04-16 rust-api framework deploy](./2026-04-16-rust-api-framework-deploy.md)
  - decision: proceed; Axum `rust-api`, `deploy-rust-api.yml` + `scripts/deploy-rust-api.sh` mirror `deploy-azure.yml`
  - unresolved risk: Prism secrets empty breaks first create same as rust-blog if misconfigured
  - follow-up: wire DNS / public URL when promoting beyond smoke test

- [2026-04-17 contact email jdetle](./2026-04-17-contact-email-jdetle.md)
  - decision: proceed; `johndetlefs@gmail.com` → `jdetle@gmail.com` on work-with-me page and pitch doc
  - unresolved risk: none
  - follow-up: none

- [2026-04-16 work-with-me capacity approval](./2026-04-16-work-with-me-capacity-approval.md)
  - decision: proceed; employer approval + ~10h/week + advisory-first on `/work-with-me` and pitch doc
  - unresolved risk: numbers and policy may drift
  - follow-up: refresh copy if employment situation changes

- [2026-04-16 marketability nav CTAs](./2026-04-16-marketability-nav-ctas.md)
  - decision: proceed; add `/work-with-me` to default nav, posts index footer, home CTAs + PostHog `work_with_me`
  - unresolved risk: none for this diff
  - follow-up: optional narrow-mobile visual pass if CTA row feels crowded

- [2026-04-14 analytics ingestion URL env](./2026-04-14-analytics-ingestion-url-env.md)
  - decision: proceed with push; `ANALYTICS_API_URL` preferred over `NEXT_PUBLIC_*` for Next proxies
  - unresolved risk: two env names could diverge if both set to different values
  - follow-up: drop legacy `NEXT_PUBLIC_ANALYTICS_API_URL` in Vercel when safe

- [2026-04-14 home hero fingerprint avatar](./2026-04-14-home-hero-fingerprint-avatar.md)
  - decision: proceed with push; hero grid + `HomeFingerprintAvatar`; PostHog init gated on key
  - unresolved risk: SVG trust boundary same as `/who-are-you` avatar path; analytics env required for visible avatar
  - follow-up: optional e2e when analytics env absent

- [2026-04-14 who avatar anthropic push](./2026-04-14-who-avatar-push.md)
  - decision: proceed with push; migrate `003_user_profiles_avatar.cql` before/with analytics-ingestion deploy
  - unresolved risk: Anthropic availability for on-demand generation
  - follow-up: verify `cqlsh` ALTER on production keyspace

- [2026-04-14 home recent who push](./2026-04-14-home-recent-who-push.md)
  - decision: proceed with push; hero first after masthead; Guardian AI copy without errata framing; CSS specificity fix for Biome
  - unresolved risk: Guardian claims vs evolving README until human pass
  - follow-up: optional mobile visual pass on home

- [2026-04-14 guardian post ai draft](./2026-04-14-guardian-post-ai-draft.md)
  - **scope:** live post is `jdetle-guardian` → `https://github.com/jdetle/guardian` (macOS agent resource monitor for Cursor/Codex)
  - decision: proceed; AI draft default + human stub for visibility
  - follow-up: human review; verify claims against current README

- [2026-04-01 animated-frame mobile first paint](./2026-04-01-animated-frame-mobile-first-paint.md)
  - decision: proceed with push; transform-only motion, no SSR `opacity:0`
  - unresolved risk: slightly different entrance (no fade); reduced-motion unchanged
  - follow-up: optional visual regression on home if users report motion differences

- [2026-03-20 posthog-ci-verify](./2026-03-20-posthog-ci-verify.md)
  - decision: proceed with merge; PostHog verify + tests + Bun XFF middleware
  - unresolved risk: verify step false-negative if preview lacks `NEXT_PUBLIC_POSTHOG_KEY` or HogQL lags past retries; 2h count is project-wide
  - follow-up: optional HogQL filter on preview URL; tune delays from metrics

- [2026-03-20 privacy-onboarding-wizard](./2026-03-20-privacy-onboarding-wizard.md)
  - decision: proceed with push; URL guards + honest copy; v1 curated list
  - unresolved risk: link rot and macOS Settings deep-link drift; Firefox-centric blocker link may not match all users
  - follow-up: optional CI xcodebuild; periodic URL audit; consider cross-browser copy polish

- [2026-03-20 who-are-you-picture-copy](./2026-03-20-who-are-you-picture-copy.md)
  - decision: proceed with push; copy-only, aligns with plain-language UX feedback
  - unresolved risk: “fingerprint shown above” assumes scroll order on small viewports
  - follow-up: optional anchor link to fingerprint section if users report confusion

- [2026-03-19 who-are-you-event-viz](./2026-03-19-who-are-you-event-viz.md)
  - decision: proceed with push; URL decode + viz UI low-risk
  - unresolved risk: my-events query abuse (same as prior); odd `%` edge cases in stored URLs
  - follow-up: optional rate-limit; Web Vitals subsection later

- [2026-03-19 share-post-tracking](./2026-03-19-share-post-tracking.md)
  - decision: proceed with push; clean review
  - unresolved risk: none
  - follow-up: add clipboard .catch() for HTTP/unfocused tabs; monitor PostHog for post_shared events

- [2026-03-19 analytics-mocking-llm-ticker](./2026-03-19-analytics-mocking-llm-ticker.md)
  - decision: proceed with merge; add anti-tracking guidance + reduced-motion
  - unresolved risk: LLM cost at scale; Cosmos not in CI
  - follow-up: cost monitoring for summarization; consider #[ignore] on Cosmos test

- [2026-03-18 rules-post-replace-pageviews](./2026-03-18-rules-post-replace-pageviews.md)
  - decision: proceed with push
  - unresolved risk: none
  - follow-up: optional — prune empty posts/2026-q1/

- [2026-03-18 analytics-my-events](./2026-03-18-analytics-my-events.md)
  - decision: merge completed; multi-source analytics aggregation
  - unresolved risk: Personal API key; rate-limit if abuse
  - follow-up: set POSTHOG_PERSONAL_API_KEY, POSTHOG_PROJECT_ID in Vercel

- [2026-03-17 vercel-deploy-prebuilt](./2026-03-17-vercel-deploy-prebuilt.md)
  - decision: merge completed; fix correct and low-risk
  - unresolved risk: none
  - follow-up: verify Deploy to Vercel job passes on next main push

- [2026-03-17 analytics-cleanup-ci-ga4](./2026-03-17-analytics-cleanup-ci-ga4.md)
  - decision: proceed with push and merge
  - unresolved risk: dead script refs in raw HTML; posts/ vs content/posts/ duplication
  - follow-up: optional prune of duplicate posts/ tree

- [2026-03-17 analytics-integration-guide](./2026-03-17-analytics-integration-guide.md)
  - decision: proceed with push and merge
  - unresolved risk: none blocking; ingest:meta-pixel script deferred to follow-up
  - follow-up: optional — add scripts/ingest-env/meta-pixel.ts for consistency

- [2026-03-16 nextjs-rust-analytics](./2026-03-16-nextjs-rust-analytics.md)
  - decision: proceed with push and merge
  - unresolved risk: Azure/ACR env not configured; Cosmos index must be created manually
  - follow-up: document ACR and Container App setup

- [2026-03-16 rules and blog story](./2026-03-16-rules-and-blog-story.md)
  - decision: proceed with push and PR
  - unresolved risk: large rule-catalog import may increase process overhead
  - follow-up: consider splitting or pruning rule catalog in a subsequent PR
