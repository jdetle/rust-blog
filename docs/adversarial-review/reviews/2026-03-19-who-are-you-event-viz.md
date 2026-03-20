# Adversarial review: who-are-you event viz + URL decode

**chaos_mode:** high  
**Scope:** `feat/who-are-you-event-viz` vs `origin/main` — URL display helpers, `/api/analytics/my-events` normalization, `EventHistoryViz` UI, hazel CSS tokens, profile ticker labels.

## Phase 1 — Offense

- **Security:** `absoluteEventUrl` + external links open in new tabs — `javascript:` should never reach `href` if APIs only store http(s); warehouse payloads could theoretically inject odd schemes. Mitigation: display path uses `formatPageLabel`; links only when `isLinkablePageUrl` (http(s) or `/`).
- **Privacy:** Event history is more visually prominent; same data as before, but higher salience could feel more “surveillance-y.” Copy unchanged; user already opted into the page purpose.
- **Perf:** `motion` on timeline items + density bars — bounded event list (50–100); acceptable. Reduced motion respected for density bar animation.
- **Correctness:** Double `decodeURIComponent` can mangle strings that legitimately contain `%` as data — rare for URLs; max 3 passes is a documented tradeoff.
- **A11y:** Timeline uses semantic `<ol>` / `<motion.li>`; legend is `<section aria-label>`. Density strip uses `role="img"` with `aria-label`.

## Phase 2 — Defense

- URL helpers are defensive (`try`/`catch`), tested with Bun (`lib/url-display.test.ts`). Server-side decode aligns JSON with UI expectations.
- No new dependencies; aligns with vendoring bias.
- Build + Biome clean on touched files; merge with `main` verified (already up to date).

## Phase 3 — Synthesis

| Concern | Verdict |
|--------|---------|
| Open redirect / XSS via URL | Low — `new URL` + protocol checks for linkability |
| Bundle size | Small increase on `/who-are-you` only |
| Maintenance | CSS duplicated in `posts/blog.css` — intentional sync comment |

**Decision:** **Proceed with push** — merge-ready; risks residual and documented.

**Unresolved risk:** Abuse of `/api/analytics/my-events` unchanged from prior work (fingerprint/distinct_id query); rate-limit remains a platform follow-up.

**Follow-up:** Optional Visx if timeline needs scales; Web Vitals block per plan doc.
