# Adversarial Review: Rules post, remove pageviews post

**Date:** 2026-03-18  
**Branch:** chore/rules-post-replace-pageviews  
**Scope:** Content-only (1 add, 1 delete)

## Change summary

- Add `content/posts/rules-that-make-quality-sites-easy.html` — blog post on Cursor rules and quality
- Delete `posts/2026-q1/what-your-pageviews-tell-me-about-your-life.html`

## Offense

- **Scope creep?** No. Explicit user request.
- **Accidental reversion?** Pageviews post was in `posts/2026-q1/` only; app serves from `content/posts/`, so it wasn't in the Next.js post listing. Deleting removes it from repo. No content/posts duplicate.
- **Semantic correctness?** New post is in content/posts, will appear in /posts and /posts/rules-that-make-quality-sites-easy. Correct.
- **Edge cases?** Empty `posts/2026-q1/` remains; cosmetic. No functional impact.

## Defense

- Build passes. New post parses and renders.
- Both changes align with user request.

## Synthesis

**Decision:** Proceed with push.

**Unresolved risk:** None.

**Follow-up:** Optional — remove empty `posts/2026-q1/` or document posts/ vs content/posts/ in a future cleanup.
