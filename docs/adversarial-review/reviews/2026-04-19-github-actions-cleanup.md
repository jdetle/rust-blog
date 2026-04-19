# Adversarial review — GitHub Actions cleanup (Azure deploy + remove Vercel preview E2E)

**Date:** 2026-04-19  
**Branch:** `cursor/ci-remove-vercel-env-placeholder-step`  
**Scope:**

```
 .github/workflows/deploy-vercel.yml → deploy-frontend.yml (rename + path filter fix)
 .github/workflows/e2e-preview.yml     | 56 ----------------------
 README.md                            |  8 ++--
 docs/azure-deployment.md             |  2 +-
 e2e/README.md                        |  11 -----
```

## Offense

- Removing `e2e-preview.yml` drops automated PR smoke against a preview URL and the optional `verify:analytics-read-apis` step; teams that still relied on Vercel Preview + that workflow lose CI signal unless they run scripts locally (`PREVIEW_URL=... bun run test:e2e:preview`).

## Defense

- Production path is Azure App Service behind Cloudflare; the preview workflow depended on `wait-for-vercel-preview` and `VERCEL_AUTOMATION_BYPASS_SECRET`, so it was misleading and often a no-op if Vercel previews are unused. Local/manual preview testing remains via `scripts/e2e-preview.ts`.
- Renaming `deploy-vercel.yml` → `deploy-frontend.yml` matches actual behavior and updates path filters so pushes that touch only the workflow file still trigger deploys.

## Synthesis

**Decision:** Proceed  

**Unresolved risk:** Anyone who re-enables Vercel (or another host) for PR previews must add a new workflow or reuse the deleted YAML from history; document that in README if the need returns.

**Follow-up:** none unless preview CI is required again — then add a host-agnostic workflow (dispatch input or `workflow_run`) instead of Vercel-only.
