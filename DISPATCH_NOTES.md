# Dispatch notes

Operational follow-ups consolidated for SMART task tracking. Primary source for **this repo** (`jdetle.com` / rust-blog frontend): [`docs/adversarial-review/follow-ups.md`](docs/adversarial-review/follow-ups.md) and [`docs/adversarial-review/reviews/TLDR.md`](docs/adversarial-review/reviews/TLDR.md).

## External worktrees (content not available in CI sandbox)

These paths exist on author machines only; notes there were **not** merged into this file because the branches are untracked locally. When you commit `DISPATCH_NOTES.md` on each branch—or paste contents here—append them under [External imports](#external-imports) or open a PR that adds rows to [`docs/dispatch-smart-tasks.md`](docs/dispatch-smart-tasks.md).

| Repo / context | Branch / hint |
|----------------|---------------|
| agentdds | `chore/split-ci-deploy-workflows` |
| rust-blog | `refactor/conflict-reduction` (distinct clone/worktree—may overlap this repo’s branch naming) |
| guardian | Worktree branch `claude/reverent-cannon-ea52b5` |
| platform | Likely `main`; confirm when session finishes |

## This repository — canonical open items

From `follow-ups.md`:

- Update Azure App Service application settings with `BLOG_SERVICE_URL` after `ca-rust-blog` blog-service deploy is live.
- Rename `/v1/info` JSON field `service` from `"rust-api"` to `"blog-service"` after first full blog-service deploy.
- Teardown orphaned Azure Container Apps: `ca-rust-api` in `rg-rust-blog`, `analytics-ingestion` in `rg-jdetle-blog` — after blog-service smoke passes (see [`docs/runbooks/teardown-legacy-container-apps.md`](docs/runbooks/teardown-legacy-container-apps.md)).
- Wire DNS / public URL for rust-api when promoting beyond smoke test.
- Remove legacy `NEXT_PUBLIC_ANALYTICS_API_URL` from production env once confirmed unused.
- Verify `cqlsh` ALTER on production keyspace for avatar schema (`003_user_profiles_avatar.cql`) with analytics-ingestion/blog-service deploy.
- Optional: narrow-mobile visual pass if nav CTA row feels crowded.
- Optional: e2e path when analytics env absent (env-less CI).
- Human review: Guardian post claims vs current README.
- Optional: visual regression on home entrance motion if users report differences.
- Optional: mobile visual pass on home.
- Refresh `/work-with-me` copy if employment situation changes.

## This repository — additional TLDR follow-ups

Not duplicated in `follow-ups.md` yet; still actionable:

- Azure App Service cutover: provision Linux B1 web app (rust-blog subscription), configure GitHub OIDC secrets, point Cloudflare at Azure ([`2026-04-18-azure-app-service-frontend`](docs/adversarial-review/reviews/2026-04-18-azure-app-service-frontend.md)).
- Site positioning sequence: (1) lead-post hygiene guard so flagship slot never shows draft/caveat posts, (2) hero copy + CTA swap, (3) domain-aliased contact email ([`2026-04-17-site-positioning-agentic-business`](docs/adversarial-review/reviews/2026-04-17-site-positioning-agentic-business.md)).
- Optional PostHog CI: HogQL filter on preview URL; tune retry delays from metrics.
- Privacy onboarding wizard: optional CI `xcodebuild`; periodic URL audit; cross-browser copy polish.
- Who-are-you: optional same-page anchor to fingerprint section if support tickets mention “shown above.”
- `/api/analytics/my-events`: optional rate-limit; Web Vitals subsection later.
- Share-post: `clipboard.writeText` `.catch()` for HTTP/unfocused tabs; monitor PostHog `post_shared`.
- LLM ticker: cost monitoring for summarization; consider `#[ignore]` on Cosmos test in CI.
- Optional: prune empty `posts/2026-q1/` if still unused.
- Azure App Service: set `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID` for my-events flows.
- Confirm frontend deploy GitHub Action passes on next `main` push.
- Optional: prune duplicate `posts/` vs `content/posts/` tree after audit.
- Optional: add `scripts/ingest-env/meta-pixel.ts` for ingest consistency.
- Document ACR + Azure Container Apps setup for operators.
- Optional: split or prune imported rule catalog if process overhead hurts.

## External imports

_No content merged yet — add excerpts from agentdds / rust-blog refactor branch / guardian / platform when committed._
