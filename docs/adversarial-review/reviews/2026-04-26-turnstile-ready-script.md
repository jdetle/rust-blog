---
date: 2026-04-26
slug: turnstile-ready-script
mode: diff-audit
status: proceed
scope: components/turnstile-gate.tsx, e2e/avatar-generation.spec.ts
diff_base: origin/main
veto_fired: false
follow_up_open: false
caught_real_issue: pending
---

# Adversarial review - turnstile-ready-script

**Date:** 2026-04-26
**Branch:** `fix/turnstile-ready-script`
**Scope:**

```text
 components/turnstile-gate.tsx | 39 +++++++++++++--------------------------
 e2e/avatar-generation.spec.ts | 18 ++++++++++--------
 2 files changed, 23 insertions(+), 34 deletions(-)
```

## Offense

- Accidental reversions: no rebase or conflict resolution occurred; the diff touches only Turnstile client wiring in `components/turnstile-gate.tsx` and its e2e stub in `e2e/avatar-generation.spec.ts`.
- Scope creep: Biome formatting adjusted three pre-existing line wraps in `e2e/avatar-generation.spec.ts`; those hunks are formatter-only and do not change assertions or route stubs.
- Semantic correctness: the production error complains about calling `turnstile.ready()` while loading `api.js` with async/defer. `components/turnstile-gate.tsx` now removes the `ready` type and helper, and calls `turnstile.render()` only after `window.turnstile` exists.
- Edge cases: existing multi-instance handling remains: if another component inserted the script, the component still polls for `window.turnstile` before rendering.
- Test coverage: no new runtime test was added, but the e2e Turnstile stub was updated to match the reduced API surface so future type checking does not reintroduce `ready`.

## Defense

- The script loader still uses explicit mode and keeps `async`/`defer`, which is acceptable because the code no longer invokes the Cloudflare method that rejects that loading mode.
- The render path still has the same duplicate-render guard (`widgetIdRef.current`) and cleanup behavior (`turnstile.remove`) as before.
- `bunx biome check components/turnstile-gate.tsx e2e/avatar-generation.spec.ts` passes.

## Synthesis

**Decision:** Proceed

**Unresolved risk:** TypeScript was not fully proven in this fresh worktree because app dependencies were not installed; the attempted `bunx tsc --noEmit` failed on unresolved project dependencies before this change could be isolated.

**Follow-up:** none
