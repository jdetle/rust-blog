# Adversarial Review: Guardian post (AI draft, visible)

> **Update (2026-04-14):** The essay now points at `jdetle-guardian` and `https://github.com/jdetle/guardian` (macOS agent resource monitor for Cursor/Codex).

## TL;DR
- decision: proceed with push; multi-version post, default AI, human placeholder for prod visibility
- key reason: static content only; claims trace to `jdetle/guardian` README
- top unresolved risk: README/features evolve; re-verify on human pass
- immediate next step: human replaces `versions/human.html` when ready

## Phase 1 — Offense
- **Accuracy:** Feature list must stay aligned with upstream README (daemon, hooks, gates, queue).
- **Visibility:** Two versions (ai + human stub) satisfy `isAiOnly` — “Human” tab is placeholder until edited.
- **Enterprise framing:** “Mandate” language is opinion; author may soften on review.

## Phase 2 — Defense
- **Accuracy:** Links use `https://github.com/jdetle/guardian` only; intro states the intended repo clearly.
- **AI draft:** Opening and footer label machine-generated content explicitly.
- **Product:** No app logic change; low blast radius.

## Phase 3 — Synthesis
- Ship post; follow-up is human version + possible tone edits.

## Decision Memo
- **Decision:** proceed with merge after conflict resolution.
- **Follow-up:** replace `versions/human.html`; trim AI disclaimers if redundant after review.
