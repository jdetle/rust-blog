# Adversarial Review: Guardian post (AI draft, visible)

## TL;DR
- decision: proceed with push; content-only post + manifest
- key reason: uses existing multi-version visibility pattern (not AI-only) so prod listing works
- top unresolved risk: factual drift if abcxyz/guardian README changes; user should re-verify links on human pass
- immediate next step: human replaces `versions/human.html` when ready

## Debate Config
- chaos_mode: high
- evidence_rule: claims trace to public Guardian README / repo

## Phase 1 — Offense
- **Accuracy:** Post summarizes Terraform/GitHub features; upstream could add/remove capabilities between reads.
- **Visibility hack:** Two versions (ai + human stub) exist partly to satisfy `isAiOnly` — could confuse readers who expect “Human” to mean finished.
- **Voice:** AI draft tone may not match John’s final voice after edit.

## Phase 2 — Defense
- **Accuracy:** External links point to `github.com/abcxyz/guardian` and README; “not an official Google product” matches upstream disclaimer.
- **Visibility:** `defaultVersion: ai` shows draft first; `human` placeholder is explicit; footer states pending human review.
- **Product:** No code paths changed beyond static content; low blast radius.

## Phase 3 — Synthesis
- Ship as-is; follow-up is replacing human version + trimming footer when reviewed.
- Optional: add `draft` only if product should hide before review — user requested visible.

## Decision Memo
- **Decision:** proceed with push and open PR.
- **Unresolved risk:** none blocking for static editorial content.
- **Follow-up:** replace `versions/human.html` body with reviewed text; consider removing or shortening AI footer after human version ships.
