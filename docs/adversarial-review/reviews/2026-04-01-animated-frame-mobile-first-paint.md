# Adversarial review: AnimatedFrame mobile first-paint blank screen

**Change:** Replace `whileInView` + `opacity` keyframes with mount `animate` using **transform only** (`y`, `scale`). Framer SSR was emitting `style="opacity:0;…"` on `.frame`, so slow first loads on mobile showed an empty screen until JS hydrated.

**chaos_mode:** high (simulated slow network + first visit)

## Phase 1 — Offense

- **Hidden assumption:** Removing fade-in is acceptable for all pages using `AnimatedFrame` (home, posts index, post detail, who-are-you).
- **Worst case:** Users who relied on subtle fade for cognitive load get a sharper entrance; reduced-motion path unchanged (`initial={false}` / no animation when `useReducedMotion()` is true).
- **Regression:** Transform-only animation could still SSR `transform` — verified inline style is non-invisible (content remains readable).

## Phase 2 — Defense

- **Evidence:** HTML from SSR showed `opacity:0` on the main content wrapper; Playwright mobile emulation showed `frame` opacity `0` before hydration completed; after fix, SSR has no `opacity:0`, first paint shows `opacity:1`.
- **Rollback:** Revert single file `components/animated-frame.tsx`.
- **Scope:** Isolated to one client component; no API or data changes.

## Phase 3 — Synthesis

**Decision:** Proceed with push and merge.

**Unresolved risk:** None material — entrance is slightly different visually (no opacity tween).

**Follow-up:** Optional E2E or visual snapshot for `.frame` on home if regressions are reported.
