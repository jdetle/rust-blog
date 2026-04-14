# Adversarial Review TLDR

- [2026-04-14 guardian post ai draft](./2026-04-14-guardian-post-ai-draft.md)
  - **corrected:** first essay targeted wrong repo (Terraform); live post is `jdetle-guardian` → `https://github.com/jdetle/guardian`
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
