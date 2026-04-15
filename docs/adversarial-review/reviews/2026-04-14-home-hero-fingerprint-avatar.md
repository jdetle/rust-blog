# Adversarial review: home hero fingerprint avatar (2026-04-14)

**Chaos mode:** high  
**Scope:** `HomeFingerprintAvatar` beside hero `h1`, PostHog client init guard, “Who are you?” CTA on home.

## Offense (attack the change)

- **XSS / SVG injection:** Avatar HTML is rendered with `dangerouslySetInnerHTML` after server-side sanitization in Rust; client trusts API. Regression in sanitizer could ship script-bearing SVG.
- **Fingerprinting UX:** Prominent avatar reinforces tracking narrative; could feel creepy despite disclosure. Loading skeleton reserves space then collapses if absent → minor layout shift.
- **PostHog optional init:** Gating `posthog.init` on key presence fixes crashes when key missing; `window.posthog` assignment could mask a failed init in edge cases (low risk).
- **Analytics dependency:** Without `NEXT_PUBLIC_ANALYTICS_API_URL`, avatar never appears; hero may show skeleton then empty — acceptable but preview environments should be aware.

## Defense (mitigations in tree)

- SVG path matches existing `/who-are-you` pipeline; same proxy routes and Rust sanitizer as merged avatar work.
- `role="img"` + explicit `aria-label` for the injected SVG container.
- Generate-avatar is idempotent server-side; client uses `useRef` to avoid duplicate POSTs.
- Biome `noDangerouslySetInnerHtml` suppression documents trust boundary.

## Synthesis

- **Decision:** Proceed with push; scope is additive and aligns with existing analytics avatar feature on `main`.
- **Unresolved risk:** Anthropic / analytics availability for first-time generation; same as prior avatar PR.
- **Follow-up:** Optional e2e assertion that home renders without JS errors when analytics env unset.
