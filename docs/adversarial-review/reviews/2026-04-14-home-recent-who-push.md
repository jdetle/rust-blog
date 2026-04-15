# Pre-push adversarial review: `feat/home-recent-who` (home hero + Guardian copy + CSS)

**Date:** 2026-04-14  
**chaos_mode:** high  
**Scope:** `app/page.tsx` (hero block first after masthead), `posts/blog.css` (`.home-hero`, `.btn-primary` cascade order), `posts/2026-q2/jdetle-guardian/versions/ai.html` (remove errata framing), adversarial-review TLDR alignment.

## Phase 1 — Offense

| Persona | Top objection | Evidence |
|--------|----------------|----------|
| **Staff Backend Engineer** | Reordering the home layout could break assumed reading order for screen readers or skip-to-content flows. | DOM order still masthead → hero h1 → rest; no new interactive traps. |
| **Product Manager** | “Buy button” hero above the latest post might reduce clicks on the journal. | Acceptable tradeoff: user asked for hero first; lead post remains directly below. |
| **SRE / Platform** | CSS reorder might change mobile layout unexpectedly. | Build passes; `.home-hero` is static block; btn media query moved after base `.btn-primary` for cascade clarity only. |
| **Security Engineer** | Guardian HTML edits could reintroduce unsafe links. | Links remain `https://github.com/jdetle/guardian` only; no new `href` surfaces. |
| **Frontend Engineer** | Biome `noDescendingSpecificity` fix could alter who-wins for `.btn-primary` on narrow viewports. | More specific rule still follows base; width/justify only apply inside `.home-who-rich-cta`. |

**Worst case:** A CSS regression makes the Who-are-you CTA full-width on desktop — mitigated by `@media (max-width: 520px)` scope unchanged.

## Phase 2 — Defense

- **Layout:** Hero section is a single landmark with `aria-labelledby` on the h1; no duplicate h1 elsewhere on the page.
- **Content:** Guardian AI draft removes correction/errata language; factual claims still tied to README-level features; human pass remains the gate for tone.
- **CSS:** Media query placement after `.btn-primary` satisfies the linter without changing selector strings or breakpoints.
- **Rollback:** Revert single commit or restore previous `page.tsx` section order.

## Phase 3 — Synthesis

- **Decision:** **Proceed with push.** Static and presentational changes; `bun run build` succeeded locally.
- **Unresolved risk:** README drift vs essay claims until human edits `human.html`.
- **Follow-up:** Optional visual check at 375px width for home hero spacing.

## Vote

| Role | Vote |
|------|------|
| Staff BE | Approve |
| PM | Approve |
| SRE | Approve |
| Security | Approve |
| Frontend | Approve |

**Dissent:** None material.
