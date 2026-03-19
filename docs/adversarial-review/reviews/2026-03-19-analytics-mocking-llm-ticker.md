# Adversarial Review: Analytics Mocking + LLM Summarization + Profile Ticker

## TL;DR

- **decision:** Proceed with merge after adding anti-tracking guidance and non-technical UX polish
- **key reason:** Feature educates users on tracking while demonstrating transparency; mock data enables dev/testing without real PII
- **top unresolved risk:** LLM summarization cost and latency at scale; Cosmos/Scylla required for production
- **immediate next step:** Add "How to reduce what sites know" section with plain-language anti-tracking tools

## Debate Config

- **chaos_mode:** high
- **random_seed:** 42
- **evidence_rule:** major claims require code/metric/user-impact evidence

## Persona Roster

- **Backend Engineer** — risk_posture: cautious on cost and infra
- **Product Manager** — risk_posture: user value and clarity
- **Security Engineer** — risk_posture: fingerprint storage, PII surface
- **Frontend Engineer** — risk_posture: non-technical UX, ticker accessibility
- **SRE** — risk_posture: Cosmos/Scylla ops, summarization loop reliability

## Phase 1 - Offense

### Backend Engineer
- **Objection:** LLM summarization runs every 30 min and calls Anthropic API. At 1000 sessions/day, that's 1000+ API calls per cycle. Cost and rate limits will bite.
- **Evidence:** `summarize.rs` spawns loop with `SUMMARIZE_SESSIONS_PER_CYCLE` (default 10). No batching, no cost cap.
- **Worst case:** Anthropic rate limit → summarization fails silently; users see stale or empty "Composite Picture."

### Product Manager
- **Objection:** "Your Picture (building as you browse)" is jargon. A non-technical user won't understand "fingerprint," "session_id," or "events." The page feels like a developer dashboard.
- **Evidence:** `client-profile.tsx` uses terms like "fingerprint hash," "ASN," "WebRTC." No plain-language explanation of *why* this matters.
- **Worst case:** User leaves confused or creeped out without learning anything actionable.

### Security Engineer
- **Objection:** We store canvas fingerprint in a cookie and send it to `/api/analytics/user-profile`. Fingerprint + distinct_id + event history = strong cross-session identifier. If the aggregator is compromised, an attacker gets a durable identity.
- **Evidence:** `document.cookie = fingerprint=...` in client-profile.tsx; Rust API accepts fingerprint as query param.
- **Worst case:** Breach exposes fingerprint→event mapping; attacker correlates across sessions.

### Frontend Engineer
- **Objection:** ProfileTicker has no reduced-motion handling. `aria-live="polite"` is good, but the marquee animation could trigger vestibular issues. No pause/stop control.
- **Evidence:** `profile-ticker.tsx` uses CSS animation; no `prefers-reduced-motion` check.
- **Worst case:** User with motion sensitivity has to leave the page.

### SRE
- **Objection:** Seed binary and summarization loop both assume Cosmos/Scylla. CI has no Cosmos. `second_visit_summary` test skips when `COSMOS_*` unset. We're shipping code that isn't exercised in CI.
- **Evidence:** `tests/second_visit_summary.rs` returns early if `cosmos_configured()` is false; CI doesn't set those vars.
- **Worst case:** Production deploy fails or summarization never runs; no CI signal.

## Phase 2 - Defense

### Backend Engineer
- **Defense:** Cap `SUMMARIZE_SESSIONS_PER_CYCLE` at 10; add cost monitoring. Defer batching to a follow-up. Failures are non-blocking — user still sees raw events.
- **Mitigation:** Log summarization errors; alert on repeated failures.
- **Residual risk:** Cost grows with traffic; need usage-based alerting.

### Product Manager
- **Defense:** Add "How to reduce what sites know" section with 3–5 concrete tools (uBlock Origin, Firefox Strict, Brave, etc.) in plain language. Reframe "fingerprint" as "a nearly unique ID your browser creates" with a one-sentence explanation.
- **Mitigation:** Short "Why this matters" blurb at top; link to EFF or similar.
- **Residual risk:** Some users will still find it overwhelming; we accept that.

### Security Engineer
- **Defense:** Fingerprint is already exposed by design — this page *demonstrates* tracking. We don't store PII beyond what the user's browser sends. Aggregator is behind auth in production.
- **Mitigation:** Document in security overview; ensure aggregator has least-privilege.
- **Residual risk:** Fingerprint is a durable identifier; we accept that for this demo.

### Frontend Engineer
- **Defense:** Add `@media (prefers-reduced-motion: reduce)` to disable ticker animation; use static list instead. Quick one-line change.
- **Mitigation:** Test with reduced-motion enabled.
- **Residual risk:** Low.

### SRE
- **Defense:** Cosmos is required for production; CI is a known gap. Document in README. Add `#[ignore]` to test with clear skip message so it doesn't silently pass.
- **Mitigation:** Deploy pipeline uses Cosmos; staging validates.
- **Residual risk:** CI doesn't catch Cosmos schema drift.

## Phase 3 - Synthesis

### Merged Proposal Options

1. **Option A (recommended):** Merge with anti-tracking section + reduced-motion fix + optional `#[ignore]` on Cosmos test.
2. **Option B:** Defer anti-tracking to follow-up PR; merge only ticker + LLM wiring.

### Tradeoff Table

| Option | Pros | Cons |
|--------|------|------|
| A | Complete UX, addresses PM + FE objections | Slightly larger PR |
| B | Smaller, faster merge | Non-technical users get no actionable guidance |

### Final Vote

- Backend: A (with cost-monitoring TODO)
- Product: A
- Security: A (accept residual risk)
- Frontend: A
- SRE: A (with `#[ignore]` + doc)

### Core Takeaways

- Add anti-tracking guidance in plain language.
- Respect `prefers-reduced-motion` for ticker.
- Document Cosmos requirement for production; CI gap remains.
- LLM cost/rate limits need monitoring in production.

## Chaos Log

- event_1: PM persona perturbed urgency +10 (prioritize non-technical UX)
- event_2: Security persona confidence -5 on fingerprint storage (accepted residual risk)
- event_3: Backend persona risk_sensitivity +10 (cost concern)

## Decision Memo

- **recommended option:** A
- **unresolved risks:** LLM cost at scale; Cosmos not in CI
- **experiments:** None
- **rollout gates:** Build passes; Biome clean; no new lint errors
- **rollback trigger:** Summarization loop crashes repeatedly; user-profile API 5xx spike
