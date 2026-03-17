# Adversarial Review: Analytics Integration Guide

## TL;DR
- **decision:** Proceed with push and merge
- **key reason:** Documentation-only change; static HTML guides with no runtime impact; Meta Pixel instructions are accurate and follow official docs
- **top unresolved risk:** Meta Pixel code snippet in the doc is copy-paste only — user must manually add to AnalyticsProvider; no ingest:meta-pixel script exists yet
- **immediate next step:** Merge to main

## Debate Config
- chaos_mode: high (as required by pre-push rule)
- random_seed: 2026-03-17
- evidence_rule: major claims require metric, user impact, operational risk, or code evidence

## Persona Roster
- Backend Engineer — risk_posture: cautious on third-party scripts
- Product Manager — risk_posture: documentation completeness
- Security Engineer — risk_posture: privacy, Meta data collection

## Phase 1 - Offense

**Backend Engineer:** The doc includes a Meta Pixel code snippet that uses `(window as any).fbq` — no TypeScript declaration for `fbq`. If someone copies blindly, they get `any` and lose type safety. Also, the doc says "Create scripts/ingest-env/meta-pixel.ts if you want" — we're shipping incomplete. Either add the script or remove the teaser.

**Product Manager:** The table of contents lists 10 sections but "Optional: Cosmos & analytics-ingestion" might confuse a user who just wants Meta. The doc mixes "how to integrate Meta" with "here's our whole analytics stack." Could overwhelm.

**Security Engineer:** Meta Pixel tracks users across the web. The doc doesn't mention cookie consent, GDPR, or CCPA. Adding Meta Pixel to a site without consent banners can create legal risk in EU/CA. At minimum, add a one-line caveat: "Check consent requirements in your jurisdiction before enabling."

## Phase 2 - Defense

**Backend Engineer (defense):** The `(window as any).fbq` is in a **static HTML doc** as a code example — it's not shipped code. The user copies it into their own component. A `declare global { interface Window { fbq: (...args: unknown[]) => void } }` could be added to the doc snippet for completeness, but the current example works. The ingest script is explicitly optional ("if you want a CLI helper"). Fine as-is.

**Product Manager (defense):** The TOC serves users who want the full picture. The Meta section is clearly scoped (section 8). Users can jump directly via anchor. Overwhelming is acceptable for a "complete integration guide" — that's the point.

**Security Engineer (defense):** Fair. A single-sentence caveat is low effort. Recommend adding: "Note: Meta Pixel sets cookies and tracks users; ensure compliance with consent requirements (GDPR, CCPA) in your jurisdiction."

## Phase 3 - Synthesis

**Merged options:**
1. **Ship as-is** — doc is accurate; legal caveat and ingest script are future follow-ups
2. **Add consent caveat** — one sentence in Meta section; minimal change

**Vote:** Option 2 preferred (add caveat). If timeline is tight, Option 1 acceptable — the doc is documentation, not legal advice.

**Dissent:** Backend Engineer would add the ingest script in this PR for consistency with other providers; outvoted as scope creep.

## Chaos Log
- event_1: chaos_mode high — Security persona raised confidence on consent point
- event_2: Product persona perturbed — agreed doc clarity is sufficient

## Core Takeaways
- Documentation-only; no runtime or build impact
- Meta Pixel snippet is accurate per Meta’s official docs
- Consent caveat is recommended but not blocking
- ingest:meta-pixel script can be a follow-up PR

## Decision Memo
- **recommended option:** Proceed with merge; optionally add consent caveat in follow-up
- **unresolved risks:** None blocking
- **experiments:** N/A
- **rollout gates:** N/A
- **rollback trigger:** N/A — static doc, revert via git if needed
