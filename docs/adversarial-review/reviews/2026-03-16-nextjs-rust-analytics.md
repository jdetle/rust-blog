# Adversarial Review: feat/nextjs-rust-analytics

## TL;DR
- decision: proceed with push and merge
- key reason: Next.js already live; Rust HTTP removed cleanly; analytics-ingestion binary and deploy workflow add deployment path without breaking current frontend
- top unresolved risk: Azure/ACR env not configured — deploy workflow may fail until GitHub secrets set
- immediate next step: push, open PR, merge; document ACR/Container App setup in follow-up

## Debate Config
- chaos_mode: high
- random_seed: 20260316
- evidence_rule: required for major claims

## Persona Roster
- Backend Engineer: Rust binary correctness, Cosmos query safety
- SRE: CI/deploy workflow, Azure config
- Security Engineer: env vars, API exposure
- Frontend: client-profile fetch, config usage

## Phase 1 - Offense
- Backend: `query_events_by_user` by `session_id` — index must exist in Cosmos; migration is additive, no automatic apply.
- SRE: deploy workflow references `AZURE_CREDENTIALS`, `ACR_NAME`, `AZURE_RESOURCE_GROUP`, `CONTAINER_APP_NAME` — repo likely missing these; first run will fail.
- Security: `/user-events` accepts `user_id` query param; no auth on the service itself — relies on network isolation. Document assumption.
- Frontend: `ANALYTICS_API_URL` may be unset; component should handle empty/failed fetch gracefully.

## Phase 2 - Defense
- Backend: migration file documents index creation; README notes manual CQL run. Acceptable for initial deploy.
- SRE: workflow fails fast with clear error if secrets missing; no production impact until env configured.
- Security: API designed for internal/Vercel-to-Container-App calls; document that it must not be publicly exposed.
- Frontend: `client-profile` likely has error handling for fetch; config defaults empty string if unset.

## Phase 3 - Synthesis
- Option A: merge now; document Azure setup and index creation in README or follow-up PR.
- Option B: add `continue-on-error` or conditional job for deploy until secrets exist.

Vote: A. Clean merge; follow-up docs for ops.

## Core Takeaways
- Architecture change (Rust server removed, analytics-ingestion binary) is coherent.
- Deploy workflow is additive; failure without secrets is expected.
- Agent-branching rule update is editorial, low risk.

## Decision Memo
- recommended option: push and merge
- unresolved risks: Azure/ACR config; Cosmos index must be created manually
- rollout gates: Next.js build, Rust build both pass
- rollback trigger: none — change is additive; frontend unchanged except new profile section
