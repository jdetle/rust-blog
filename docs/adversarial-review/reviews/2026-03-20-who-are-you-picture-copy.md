# Adversarial Review: Who-are-you “Your Picture” plain-language copy

## Config

- **chaos_mode:** high
- **evidence_rule:** major claims tied to code or UX impact

## Context

Copy-only change on `/who-are-you`: expands “Your Picture (building as you browse)” and tightens “Your Event History” blurbs in `components/who-are-you/client-profile.tsx` — no API or logic changes.

## Phase 1 — Offense

- **PM:** “Follow-up ads elsewhere” may feel alarmist; some users bounce on anything that sounds like fear-mongering.
- **Content:** “Fingerprint shown above” assumes the user scrolled; on short viewports the fingerprint block might be below the fold — mild confusion.
- **Compliance tone:** We describe tracking plainly; ensure we don’t imply the site does something it doesn’t (copy is generic “analytics”).

## Phase 2 — Defense

- **Accuracy:** Matches actual behavior — events from `/api/analytics/my-events`, keyed by visitor id + fingerprint as elsewhere on the page.
- **Prior review alignment:** Addresses earlier feedback that the section read like dashboard jargon.
- **Risk surface:** Zero runtime risk; rollback is revert one file.

## Phase 3 — Synthesis

**Decision:** Proceed with push.

**Dissent:** Optional follow-up to add a same-page anchor link to the fingerprint section if support tickets mention “shown above.”

**Unresolved risk:** None material for a copy change.

**Follow-up:** None required for merge.
