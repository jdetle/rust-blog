# Adversarial Review: fix/vercel-deploy-prebuilt (#13)

## TL;DR
- decision: merge completed; fix is correct and low-risk
- key reason: `vercel build` defaults to preview target; `vercel deploy --prebuilt --prod` requires production build; adding `--prod` to build aligns environments
- top unresolved risk: none; change is minimal and well-documented in Vercel CLI
- immediate next step: verify Deploy to Vercel job passes on next main push

## Debate Config
- chaos_mode: high
- evidence_rule: required for major claims

## Phase 1 - Offense
- **SRE**: `--prod` on build may pull different env vars than preview. If production secrets differ and `vercel pull --environment=production` already ran, consistency is maintained — but any env-var drift between pull and build could cause subtle runtime bugs.
- **Security**: No new secrets exposed; VERCEL_TOKEN already used. No change to blast radius.
- **Reliability**: Single-line change; if `--prod` flag semantics change in future Vercel CLI, could regress. Low probability.

## Phase 2 - Defense
- **Platform**: `vercel pull --yes --environment=production` precedes build; production env vars are applied. `vercel build --prod` uses the same production env context. Environment alignment is correct.
- **Vercel docs**: [vercel build](https://www.vercel.com/docs/cli/build) states `--prod` uses Production Environment Variables. Error message explicitly required production build for `--prebuilt --prod` deploy. Fix is by the book.
- **Rollback**: Reverting the single line restores prior (broken) behavior; no cascading changes.

## Phase 3 - Synthesis
- Option A: merge (done). Fix is correct; no alternative.
- Option B: N/A — no design choice; this is a bug fix.

Vote: A. Merge completed. No dissent.

## Core Takeaways
- Vercel prebuilt deploy requires build target to match deploy target (preview vs production)
- One-line fix; minimal regression surface
- Deploy workflow should pass on next path-triggered push to main

## Decision Memo
- recommended option: merge (completed)
- unresolved risks: none
- experiments: none
- rollout gates: Deploy to Vercel job will run on next push that touches workflow or app paths
- rollback trigger: if Deploy step fails again, revert commit 9bfce5e
