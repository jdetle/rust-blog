# SMART tasks from dispatch notes

**Source:** `DISPATCH_NOTES.md` (this repo) and `docs/adversarial-review/*`. **Time-bound** uses engineering milestones, not calendar estimates.

**External:** `DISPATCH_NOTES.md` on `agentdds`, `rust-blog` (refactor branch), `guardian` worktree, and `platform` are not in this clone; add tasks to the [Backlog / external](#backlog--external-repos) table when those files are committed and copied in.

## How to read the table

- **S (Specific):** target + action.
- **M (Measurable):** explicit “done” check.
- **A (Achievable):** single owner and one PR or one runbook where possible.
- **R (Relevant):** links to review or runbook.
- **T (Time-bound):** trigger (after X, before Y, on next Z).

| ID | Task (one line) | S / M (deliverable + done when) | T (trigger) | Depends on | R (ref) |
|----|-----------------|----------------------------------|---------------|------------|---------|
| D1 | Set Vercel `BLOG_SERVICE_URL` to the live blog-service / `ca-rust-blog` base URL. | `BLOG_SERVICE_URL` in Vercel matches production; deploy still green. | After `ca-rust-blog` (blog-service) deploy is live. | None. | [blog-service e2e](adversarial-review/reviews/2026-04-17-blog-service-consolidation-avatar-e2e.md) |
| D2 | Change blog-service `GET /v1/info` response: `service: "blog-service"`. | JSON field updated; consumers of `rust-api` string updated or verified none. | After at least one full blog-service deploy; follow [review] risk on consumers. | D1 or parallel if contract is safe. | [blog-service e2e](adversarial-review/reviews/2026-04-17-blog-service-consolidation-avatar-e2e.md) |
| D3 | Teardown legacy Container Apps per runbook. | `ca-rust-api` and `analytics-ingestion` deleted or deallocated; only `ca-rust-blog` (or current) remains. | After blog-service smoke passes. | D1 live. | [teardown runbook](runbooks/teardown-legacy-container-apps.md) |
| D4 | Expose rust-api (or blog-service) on a stable public host + DNS. | Public URL resolves; health and key routes 200 from outside Azure. | When promoting past internal smoke. | App + certificate + DNS access. | [rust-api deploy](adversarial-review/reviews/2026-04-16-rust-api-framework-deploy.md) |
| D5 | Remove `NEXT_PUBLIC_ANALYTICS_API_URL` from Vercel. | Grep shows no app read of that var; Vercel project has it removed. | After `rg`/code search confirms no usage. | None. | [analytics env](adversarial-review/reviews/2026-04-14-analytics-ingestion-url-env.md) |
| D6 | Run and record `cqlsh` migration for avatar schema in production. | `003_user_profiles_avatar.cql` (or equivalent) applied; row/column check documented. | With or right after analytics/blog-service deploy. | Keyspace access. | [who avatar](adversarial-review/reviews/2026-04-14-who-avatar-push.md) |
| D7 | Optional: mobile (375px) pass on default nav CTA row. | Screenshot or PR note: no overlap; touch targets ok. | On user report of crowding. | None. | [nav CTAs](adversarial-review/reviews/2026-04-16-marketability-nav-ctas.md) |
| D8 | Optional: add e2e for “no `NEXT_PUBLIC_POSTHOG_KEY`” or similar. | New/updated Playwright (or test) passes in env-less CI path. | When running env-less CI. | CI config allows that project. | [home hero](adversarial-review/reviews/2026-04-14-home-hero-fingerprint-avatar.md) |
| D9 | Human review `jdetle-guardian` post copy vs `README` of `jdetle/guardian`. | Text updated or “verified” note in content PR. | Next content edit session. | None. | [Guardian post](adversarial-review/reviews/2026-04-14-guardian-post-ai-draft.md) |
| D10 | Optional: `toHaveScreenshot` or visual check for home entrance motion. | Baseline updated if design accepted. | If users report motion regression. | None. | [animated frame](adversarial-review/reviews/2026-04-01-animated-frame-mobile-first-paint.md) |
| D11 | Optional: mobile layout pass on home. | Short QA note or issues filed. | On mobile layout complaint. | None. | [home recent who](adversarial-review/reviews/2026-04-14-home-recent-who-push.md) |
| D12 | Update `/work-with-me` if job or capacity changes. | Copy matches current policy; link to pitch doc if any. | When employment or hours change. | None. | [work-with-me](adversarial-review/reviews/2026-04-16-work-with-me-capacity-approval.md) |
| D13 | Azure App Service: provision B1, wire GitHub OIDC, cut Cloudflare to Azure, drop Vercel domain. | App Service URL live; custom domain on Cloudflare; Vercel project deprioritized or removed. | Before calling “Vercel cutover” complete. | Azure + Cloudflare + GitHub admin. | [app service](adversarial-review/reviews/2026-04-18-azure-app-service-frontend.md) |
| D14 | Lead-post hygiene: flagship slot excludes one-line drafts and AI-default caveat posts. | Logic or filter in post-selection; unit test or fixture proves behavior. | Before hero repositioning PR if possible. | Content structure known. | [site positioning](adversarial-review/reviews/2026-04-17-site-positioning-agentic-business.md) |
| D15 | Hero repositioning + CTA swap (business + agentic narrative). | Merged PR; staging reviewed. | After D14 or in same PR if tightly coupled. | D14 preferred first. | [site positioning](adversarial-review/reviews/2026-04-17-site-positioning-agentic-business.md) |
| D16 | Domain-aliased contact email on site and docs. | Email consistently uses approved domain alias. | After hero/contact hygiene PR chain. | DNS / workspace policy. | [site positioning](adversarial-review/reviews/2026-04-17-site-positioning-agentic-business.md) |
| D17 | PostHog CI verify: optional HogQL filter + delay tuning. | Fewer flaky verify failures on preview builds. | After observing false negatives in Actions. | PostHog project access. | [posthog-ci-verify](adversarial-review/reviews/2026-03-20-posthog-ci-verify.md) |
| D18 | Privacy wizard: optional URL audit checklist + CI `xcodebuild`. | Issue list or cron doc; CI step green on macOS if added. | Maintenance window / tech-debt sprint. | macOS runner availability. | [privacy wizard](adversarial-review/reviews/2026-03-20-privacy-onboarding-wizard.md) |
| D19 | Optional: anchor link from “fingerprint shown above” to `#fingerprint`. | Anchor works on narrow viewports; no layout break. | If tickets mention confusion. | None. | [who picture copy](adversarial-review/reviews/2026-03-20-who-are-you-picture-copy.md) |
| D20 | Optional: rate-limit or abuse guard on `/api/analytics/my-events`. | 429 or deny after threshold; documented limits. | If abuse or cost spikes. | Infra / edge policy. | [who event viz](adversarial-review/reviews/2026-03-19-who-are-you-event-viz.md) |
| D21 | Share button: handle clipboard failures + monitor `post_shared`. | `.catch` on clipboard API; PostHog dashboard or alert for drops. | Next touch of share UI. | None. | [share-post](adversarial-review/reviews/2026-03-19-share-post-tracking.md) |
| D22 | LLM ticker: cost visibility + optional `#[ignore]` Cosmos test. | Metrics or budget alert; CI policy documented. | After deploy at scale or CI flake report. | PostHog/billing. | [LLM ticker](adversarial-review/reviews/2026-03-19-analytics-mocking-llm-ticker.md) |
| D23 | Optional: remove empty `posts/2026-q1/` if unused. | Directory gone or README explains retention. | Cleanup PR. | None. | [rules-post](adversarial-review/reviews/2026-03-18-rules-post-replace-pageviews.md) |
| D24 | Set `POSTHOG_PERSONAL_API_KEY` + `POSTHOG_PROJECT_ID` on Vercel for my-events. | Server routes can auth to PostHog APIs in prod. | Before relying on `/api/analytics/my-events` in prod. | Secret rotation process. | [analytics-my-events](adversarial-review/reviews/2026-03-18-analytics-my-events.md) |
| D25 | Confirm “Deploy to Vercel” workflow passes on `main`. | Latest workflow run green. | Next push to `main`. | None. | [vercel-deploy-prebuilt](adversarial-review/reviews/2026-03-17-vercel-deploy-prebuilt.md) |
| D26 | Optional: dedupe/prune duplicate `posts/` trees. | Single source of truth documented; obsolete tree removed. | Dedicated cleanup PR after inventory. | None. | [analytics-cleanup-ci-ga4](adversarial-review/reviews/2026-03-17-analytics-cleanup-ci-ga4.md) |
| D27 | Optional: align `scripts/ingest-env/meta-pixel.ts` with other ingest scripts (flags, env, docs). | README or integration guide lists Meta Pixel alongside GA4/Clarity; behavior matches naming in `package.json` `ingest:meta-pixel`. | Ingest consistency sprint. | None. | [analytics-integration-guide](adversarial-review/reviews/2026-03-17-analytics-integration-guide.md) |
| D28 | Document ACR + Container Apps setup for this stack. | `docs/` runbook: registry, apps, env, deploy hooks. | Onboarding / handoff need. | Azure access. | [nextjs-rust-analytics](adversarial-review/reviews/2026-03-16-nextjs-rust-analytics.md) |
| D29 | Optional: split or prune large rule-catalog import. | Smaller bundles or lazy load; perf note. | If startup or compile suffers. | None. | [rules and blog story](adversarial-review/reviews/2026-03-16-rules-and-blog-story.md) |

## Backlog / external repos

Paste SMART rows here when `DISPATCH_NOTES.md` from **agentdds** (`chore/split-ci-deploy-workflows`), **rust-blog** (`refactor/conflict-reduction`), **guardian** (`claude/reverent-cannon-ea52b5`), or **platform** is available.

| ID | Source repo | Task | Verification |
|----|-------------|------|--------------|
| — | agentdds | *pending import* | Commit `DISPATCH_NOTES.md` on branch and merge excerpt into `DISPATCH_NOTES.md` |
| — | rust-blog | *pending import* | Same |
| — | guardian | *pending import* | Same |
| — | platform | *pending import* | Same |

## De-duplication notes

- **D1 + D2** pair with Vercel + `/v1/info` rename from [blog-service consolidation](adversarial-review/reviews/2026-04-17-blog-service-consolidation-avatar-e2e.md).
- **D3** overlaps TLDR open risk for orphaned Container Apps — same teardown as `follow-ups.md`.
- **D4** same intent as “Wire DNS / public URL for rust-api” in `follow-ups.md`.
- **D14–D16** are one sequencing chain from site positioning review; kept as three tasks for SMART clarity.
