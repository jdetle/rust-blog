# Adversarial review — PostHog CI verification and tests

**Date:** 2026-03-20  
**Chaos mode:** high  
**Scope:** PostHog ingestion verify script + E2E preview step, `fetchEventCountRecentHours`, Bun `posthog-api` tests, Rust `posthog_pull_random_walk_inserts_expected_count`, `ci.yml` `bun test lib`, Playwright PostHog e2e, middleware `x-forwarded-for` default for Bun.

## Offense

1. PostHog verify may fail if preview lacks `NEXT_PUBLIC_POSTHOG_KEY` or HogQL lags beyond retries.
2. HogQL `count()` over 2h is project-wide, not preview-specific.
3. Fork PRs skip the verify step (no secrets).

## Defense

1. Retries and configurable `POSTHOG_VERIFY_*` env vars; document Vercel env for client PostHog.
2. Acceptable proxy for “events reached PostHog”; optional URL filter as follow-up.
3. Expected for forks.

## Synthesis

**Decision:** Proceed with merge.  
**Unresolved risk:** False-negative verify if keys or timing wrong.  
**Follow-up:** HogQL filter on preview hostname; tune retry budget from CI metrics.
