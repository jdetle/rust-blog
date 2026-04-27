---
date: 2026-04-27
slug: linkedin-share-utm
mode: diff-audit
status: proceed
scope: app/posts/[slug]/page.tsx, app/who-are-you/page.tsx, components/share-bar.tsx, lib/share-tracking.ts, lib/share-url.ts, lib/share-tracking.test.ts
diff_base: origin/main
veto_fired: false
follow_up_open: false
caught_real_issue: pending
---

# Adversarial review — linkedin-share-utm

**Date:** 2026-04-27
**Branch:** `fix/linkedin-share-utm`
**Scope:** `6 files changed, 65 insertions(+), 49 deletions(-)`

## Offense
- None. `components/share-bar.tsx`, [`app/posts/[slug]/page.tsx`](/Users/johndetlefs/github/one/rust-blog-wt/linkedin-share-utm/app/posts/[slug]/page.tsx), and [`app/who-are-you/page.tsx`](/Users/johndetlefs/github/one/rust-blog-wt/linkedin-share-utm/app/who-are-you/page.tsx) stay tightly in scope for the request: generalize share URL generation, preserve post behavior, and add the same LinkedIn share flow to `/who-are-you`.
- No accidental reversion signal appeared in the touched files: `lib/share-tracking.ts` only extracts pure URL/share-platform helpers into [`lib/share-url.ts`](/Users/johndetlefs/github/one/rust-blog-wt/linkedin-share-utm/lib/share-url.ts) while keeping analytics capture unchanged.
- Edge-case coverage exists for the changed behavior in [`lib/share-tracking.test.ts`](/Users/johndetlefs/github/one/rust-blog-wt/linkedin-share-utm/lib/share-tracking.test.ts): one post URL case, one `/who-are-you` case, and one LinkedIn handoff case.

## Defense
- The new `path`, `campaign`, and `content` props are additive in `components/share-bar.tsx`, with defaults preserving the prior post-share semantics (`post_share`, `slug`).
- LinkedIn continues to receive the fully encoded share target through `https://www.linkedin.com/sharing/share-offsite/?url=...`, so the UTM query string stays attached to the shared destination URL.
- Verification passed for the behavior under change: `bun test lib/share-tracking.test.ts` and `bunx biome check lib/share-url.ts lib/share-tracking.ts lib/share-tracking.test.ts components/share-bar.tsx 'app/posts/[slug]/page.tsx' app/who-are-you/page.tsx`.

## Synthesis

**Decision:** Proceed

**Unresolved risk:** Manual browser validation of the LinkedIn popup flow was not run in this worktree, so the review relies on the generated URL shape plus unit coverage rather than an end-to-end click test.

**Follow-up:** none
