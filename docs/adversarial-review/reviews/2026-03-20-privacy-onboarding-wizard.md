# Adversarial review: macOS Privacy Onboarding Wizard

**Date:** 2026-03-20  
**Scope:** `apps/privacy-onboarding-wizard/` — SwiftUI wizard, curated recommendations, user-initiated opens to official HTTPS docs and Apple System Settings deep links.  
**chaos_mode:** high (stress assumptions; three perturbations noted inline)

## Context

- New native macOS app (not wired into CI in this PR). Opens URLs only via `URLOpener` with scheme guards (`http`/`https` for browser; `x-apple.systempreferences` for Settings).
- README promises no silent third-party installs; recommendations include Mozilla add-ons URL for uBlock Origin as “official” storefront link.

## Phase 1 — Offense

| Concern | Detail |
|--------|--------|
| **Supply chain / trust** | Curated URLs can rot, redirect, or change policy. Mozilla AMO link is third-party relative to Apple; still user’s browser extension ecosystem. |
| **UX liability** | Copy promises privacy outcomes; users may infer VPN-level anonymity. Mitigated by limitations text per step and intro “does not do” section. |
| **Deep links** | `x-apple.systempreferences` paths can change between macOS versions; Settings panes may not open as expected on older OS. |
| **No automated build gate** | Xcode project not in CI; regressions only caught manually. |

**Chaos perturbation 1:** Recommendation list ships Firefox-centric blocker link; Safari-only users may feel steered—acceptable if copy stays browser-neutral in title.

**Chaos perturbation 2:** `ForEach` on filtered items—`Recommendation` must be `Identifiable`; verify stable ids (it uses `id` strings—good).

**Chaos perturbation 3:** App Store / notarization not in scope; distributed DMG would need signing per repo macOS rule (future).

## Phase 2 — Defense

| Mitigation | Evidence |
|------------|----------|
| URL scheme allowlist in code | `URLOpener` rejects non-http(s) and non-`x-apple.systempreferences` for respective actions. |
| Honest framing | Each recommendation has limitations; intro states not a VPN and does not guarantee anonymity. |
| No background network | README: outbound only on button; no analytics by default. |
| Official sources | Apple Support + AMO (vendor extension page), not arbitrary blogs. |

## Phase 3 — Synthesis

**Decision:** **Proceed with push.** Scope is appropriate for a v1 catalog + UI shell; risks are operational (link maintenance) and user-education (already partially addressed).

**Dissent / residual risk:** Curated list is opinionated (e.g., one Firefox extension); periodic review of URLs and cross-browser wording in UI is advisable.

**Follow-up (non-blocking):** Add `xcodebuild` to CI only if repo standardizes macOS builds; consider SF Symbols / icons per step for scanability; keep TLDR of external link changes in CHANGELOG or README “Editing recommendations.”

**Vote:** Ship — **yes**, with documentation that this app does not replace enterprise MDM or compliance review.
