# Adversarial Review: feat/analytics-my-events (#15)

## TL;DR
- decision: merge completed; feature adds multi-source analytics aggregation
- key reason: /api/analytics/my-events consolidates warehouse + PostHog events; client-profile uses fingerprint fallback; AUTH comment documents public access
- top unresolved risk: Personal API key in env — ensure never exposed to client; rate-limit API if abuse observed
- immediate next step: configure POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID in Azure App Service application settings for production

## Debate Config
- chaos_mode: high
- evidence_rule: required for major claims

## Phase 1 - Offense
- **Security**: POSTHOG_PERSONAL_API_KEY has broad access; if leaked, attacker could query any distinct_id. Mitigation: server-only env var; never in client bundle.
- **Privacy**: User requests own events by fingerprint — fingerprint is client-computed, could be spoofed. API returns only event metadata (type, URL, date), no PII. Low exposure.
- **Reliability**: PostHog Events API is deprecated; batch exports recommended long-term. Current implementation works; document tech debt.

## Phase 2 - Defense
- **API route**: Uses `new URL()` for warehouse fetch (outbound-url-safety). PostHog client uses `new URL(path, POSTHOG_API_BASE)`. AUTH comment documents public-by-design (user self-identifies).
- **client-profile**: Removed ANALYTICS_API_URL gate — events section always visible; fetch when distinct_id or fingerprint available. Broader UX.
- **plans/**: analytics-multi-source.md documents phased approach; Phase 2 (Clarity identify) deferred.

## Phase 3 - Synthesis
- Option A: merge (done). Feature complete for Phase 1.
- Vote: A. No dissent.

## Core Takeaways
- Multi-source analytics aggregation enables who-are-you to show PostHog + warehouse events
- Fingerprint fallback improves first-visit and privacy-focused users
- Plan doc guides future Phase 2 (Clarity) and Phase 3 (GA4/BigQuery)

## Decision Memo
- recommended option: merge (completed)
- unresolved risks: PostHog API deprecation; rate-limit if abuse observed
- rollout gates: Set POSTHOG_PERSONAL_API_KEY, POSTHOG_PROJECT_ID in production env
- rollback trigger: if Events API breaks, revert and use warehouse-only until batch export ready
