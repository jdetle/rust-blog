# Adversarial review — marketability nav / home CTAs

**Date:** 2026-04-16  
**Branch:** `feat/marketability-nav-ctas`  
**chaos_mode:** high (scope: navigation + analytics event naming)

## Offense

- Broken link risk if `/work-with-me` route removed or renamed.
- Home CTA row gains a fifth button; mobile layout could wrap awkwardly or crowd touch targets.
- PostHog event `work_with_me` must stay stable if dashboards depend on labels.

## Defense

- Route exists on `main` from merged contractor positioning PR; link targets app route, not external URL.
- `cta-row` already uses flex wrap patterns in blog CSS; same treatment as existing four CTAs.
- New label matches existing snake_case convention (`who_are_you`, `read_blog`).

## Synthesis

**Decision:** Proceed with push. Change is additive; default `NavRow` keeps post pages consistent without duplicating link arrays on work-with-me and who-are-you.

**Unresolved risk:** None material for this diff.

**Follow-up:** Optional visual check on narrow mobile if CTA row feels busy.
