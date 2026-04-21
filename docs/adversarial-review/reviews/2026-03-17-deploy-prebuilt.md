# Adversarial Review: CI deploy / prebuilt alignment (#13)

## TL;DR

- **Decision:** Merge completed; fix is correct and low-risk.
- **Key reason:** Production deploy must use a production-target build artifact; preview and production env blocks must not diverge for the same release.
- **Top unresolved risk:** None for this narrow change.
- **Immediate next step:** Verify the frontend deploy workflow passes on the next `main` push.

## Debate Config

- chaos_mode: high
- evidence_rule: required for major claims

## Phase 1 — Offense

- **SRE:** Build-time env can differ from runtime if secrets are misaligned between CI and the host — keep Azure App Service application settings and GitHub Actions secrets in sync.
- **Security:** No new secrets implied by the workflow alignment itself.
- **Reliability:** Small workflow change; regression surface is limited to the deploy path.

## Phase 2 — Defense

- **Platform:** CI should build with the same `NODE_ENV` / env contract as production.
- **Rollback:** Reverting the workflow line restores prior behavior if needed.

## Phase 3 — Synthesis

- **Option A:** Merge (done). Fix is appropriate for host-agnostic CI.
- **Vote:** A. Merge completed.

## Core Takeaways

- Prebuilt or cached build output must match the environment you deploy to.
- Deploy workflow should pass on path-triggered pushes to `main` when workflows or app paths change.

## Decision Memo

- **Recommended option:** merge (completed)
- **Unresolved risks:** none noted
- **Rollout gates:** frontend deploy job green on next relevant push
- **Rollback trigger:** if the deploy step fails repeatedly, revert the workflow commit and investigate env parity
