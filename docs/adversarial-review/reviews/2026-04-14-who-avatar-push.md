# Pre-push adversarial review: `feat/who-avatar-anthropic`

**Date:** 2026-04-14  
**chaos_mode:** high  
**Scope:** Anthropic Messages API → fictional persona + SVG avatar; `user_profiles` columns; Next proxy + who-are-you UI.

## Phase 1 — Offense

| Concern | Mitigation |
|--------|------------|
| SVG XSS if sanitizer misses a vector | Reject script, on\*, foreignObject; size cap; server-only render path. |
| Abuse of generate endpoint | Same public model as user-profile; idempotent cache; fingerprint required for generate. |
| Cosmos ALTER without migration | Documented `003` CQL; deploy blocked until applied. |

## Phase 2 — Defense

- No photorealistic prompt; speculative copy; aria-label on avatar.
- Rust sanitizer + Claude output parsing; no raw user SVG upload.

## Phase 3 — Synthesis

- **Decision:** Proceed with push; run `003` migration before or with analytics deploy.
- **Residual risk:** Anthropic outage returns 502; user sees no avatar until retry.

## Vote: approve (all roles)
