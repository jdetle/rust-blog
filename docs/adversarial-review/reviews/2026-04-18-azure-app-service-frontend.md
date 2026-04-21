---
date: 2026-04-18
slug: azure-app-service-frontend
mode: diff-audit
status: proceed
scope: .github/workflows/deploy-frontend.yml, next.config.ts, package.json, README.md, docs/azure-deployment.md
diff_base: origin/main
veto_fired: false
follow_up_open: true
caught_real_issue: pending
---

# Adversarial review — azure app service frontend

**Date:** 2026-04-18
**Branch:** `cursor/azure-app-service-9ef5`
**Scope:** 5 files changed — frontend deploy workflow, standalone build config, package metadata, and deployment docs

## Offense
- The first draft of the App Service workflow pointed Azure at `.next/standalone/server.js`, but the packaged artifact copies `.next/standalone/*` into the zip root, so the runnable file is `server.js` instead. Evidence: `.github/workflows/deploy-frontend.yml` sets `--startup-file "node server.js"` after catching the mismatch during artifact assembly.
- The app reads blog content from disk at runtime via `lib/posts.ts` using `process.cwd()` + `posts/`, so a naive standalone deploy would boot but fail to serve posts. Evidence: `next.config.ts` adds `outputFileTracingIncludes` for `./posts/**/*`, and the workflow explicitly copies `posts/` into the deploy zip.
- The Azure cutover is incomplete if the operator stops at repo changes. Evidence: `docs/azure-deployment.md` still requires manual Azure portal provisioning, GitHub OIDC secrets, and Cloudflare DNS changes after validation.

## Defense
- The startup-file bug was caught before push by assembling the artifact locally and checking the packaged layout; the workflow and docs now both use `node server.js`.
- The disk-backed content risk is mitigated in two layers: Next standalone tracing includes `posts/**/*`, and the workflow copies `posts/` into the deployment artifact explicitly.
- Manual follow-through is expected for this migration because Azure, Cloudflare, GoDaddy, and DNS registrar credentials are external to the repo; the updated docs make those required steps explicit and concrete.

## Synthesis

**Decision:** Proceed

**Unresolved risk:** The production cutover still depends on manual Azure App Service provisioning and Cloudflare DNS updates; if those settings are incomplete, the new workflow will not deploy a reachable public site.

**Follow-up:** author — provision the Linux B1 App Service in the `rust-blog` subscription, add the five `AZUREAPPSERVICE_*` GitHub secrets, then update Cloudflare DNS after validation
