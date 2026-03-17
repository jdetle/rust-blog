# Adversarial Review: feat/analytics-cleanup-ci-ga4

## TL;DR
- decision: proceed with push and merge
- key reason: Analytics API completes event flow; Next.js cleanup removes dead static files; CI and setup script improvements are low-risk
- top unresolved risk: Static HTML in `posts/` directory still references `/posts/analytics.js` in raw source (not rendered) — harmless but could confuse future editors
- immediate next step: push, open PR, merge

## Debate Config
- chaos_mode: high
- evidence_rule: required for major claims

## Phase 1 - Offense
- Backend: POST /api/events stores and forwards without rate limiting — abuse vector if endpoint ever exposed broadly.
- Frontend: Deleted `posts/analytics.js` and `posts/index.html` — content in `posts/` and `content/posts/` may still have `<script src="/posts/analytics.js">` in raw HTML; parser extracts only `.article-content` so it's not rendered, but dead references remain.
- CI: `cargo build --release` adds ~30–60s to CI; acceptable but increases PR feedback latency.
- Setup: NEXT_PUBLIC_GA4_ID placeholder written to .env — user must replace manually; no automation for GA4 signup.

## Phase 2 - Defense
- Backend: analytics-ingestion runs on Azure Container Apps; CORS restricts origins; not intended for public internet.
- Frontend: Next.js serves from `content/posts/` via lib/posts.ts; script tags are outside extracted bodyHtml, so never output. Dead refs in source are cosmetic.
- CI: Release build catches link errors; 30–60s is acceptable for a Rust project.
- Setup: GA4 has no signup API; manual ID entry is expected; placeholder improves discoverability.

## Phase 3 - Synthesis
- Option A: merge now; document that `posts/` is legacy and `content/posts/` is canonical.
- Option B: remove remaining `posts/` HTML files that duplicate `content/posts/` to eliminate confusion.

Vote: A. Merge; optional follow-up to prune duplicate `posts/` tree.

## Decision Memo
- recommended option: push and merge
- unresolved risks: minor — dead script refs in raw HTML; `posts/` vs `content/posts/` duplication
- rollout gates: Next.js build, Rust build, CI both jobs pass
- rollback trigger: none — changes are additive or cleanup
