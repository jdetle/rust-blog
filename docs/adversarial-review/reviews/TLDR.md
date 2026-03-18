# Adversarial Review TLDR

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
