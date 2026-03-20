### jdetle.com

Personal blog and journal by John Detlefs. Next.js App Router frontend deployed on Vercel. Rust analytics-ingestion service runs as a parallel daemon to pull events from Clarity/PostHog into Cosmos DB.

### Architecture

```
app/                   Next.js App Router pages (SSG + dynamic)
components/            React components (analytics, nav, profiling)
content/posts/         Raw HTML blog posts (source of truth)
lib/                   Server-side utilities (post parser, referral logic)
middleware.ts          Edge Middleware for UTM/referrer tracking
public/blog.css        Shared wabi-sabi stylesheet
src/                   Rust analytics ingestion (Cosmos, Clarity, PostHog)
```

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15 App Router on Vercel |
| Analytics ingestion | Rust binary — HTTP API + Clarity/PostHog → Cosmos DB |

### Running (Next.js — frontend)

```bash
bun install
bun run dev
```

Open http://localhost:3000.

### Running (Rust — analytics ingestion)

Run alongside the Next.js app when Cosmos + Clarity + PostHog are configured:

```bash
cargo run --bin analytics-ingestion
```

Serves HTTP on port 8080 (`GET /health`, `POST /api/events`, `GET /user-events?user_id=...`). Accepts client events at `POST /api/events`, stores them in Cosmos DB, and forwards to PostHog. Pulls events from Clarity and PostHog every 15 minutes. Requires `COSMOS_*`, `POSTHOG_API_KEY`, and optionally `CLARITY_EXPORT_TOKEN` in `.env`. Optional: `POSTHOG_PROJECT_ID` (default `1`) and `CLARITY_EXPORT_URL` override provider base URLs.

**Load / perf testing:** [docs/analytics-load-testing.md](docs/analytics-load-testing.md) (k6, oha, `cargo bench`).

**Cosmos DB:** Create the secondary index for user-events queries (run once):

```cql
CREATE INDEX events_session_id_idx ON analytics.events (session_id);
```

### Deploying (Azure Container Apps)

The analytics-ingestion service deploys to Azure Container Apps via `.github/workflows/deploy-analytics.yml`. Prerequisites:

1. Create an Azure Container Registry (ACR), resource group, and Container App with env vars: `COSMOS_CONTACT_POINT`, `COSMOS_USERNAME`, `COSMOS_PASSWORD`, `POSTHOG_API_KEY`
2. Add GitHub secrets: `AZURE_CREDENTIALS` (service principal JSON)
3. Add GitHub variables: `ACR_NAME`, `AZURE_RESOURCE_GROUP`, `CONTAINER_APP_NAME`
4. Set `NEXT_PUBLIC_ANALYTICS_API_URL` in Vercel to your Container App URL (e.g. `https://analytics-ingestion.xxx.azurecontainerapps.io`)

### Analytics

Five analytics platforms are wired in `components/analytics-provider.tsx`:

| Platform | Env var | Signup |
|---|---|---|
| Google Analytics 4 | `NEXT_PUBLIC_GA4_ID` | [analytics.google.com](https://analytics.google.com) |
| Microsoft Clarity | `NEXT_PUBLIC_CLARITY_ID` | [clarity.microsoft.com](https://clarity.microsoft.com) |
| PostHog | `NEXT_PUBLIC_POSTHOG_KEY` | [posthog.com](https://posthog.com) |
| Plausible | `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | [plausible.io](https://plausible.io) ($9/mo) |
| Vercel Analytics | Built-in | Enabled in Vercel dashboard |

Copy `.env.example` to `.env.local` and fill in your IDs. Placeholder values (containing `XXXXX`) are automatically skipped — no scripts fire until you add real IDs.

**Setup guide:** See [Analytics Integration](/docs/analytics-integration.html) for step-by-step setup (GA4, Clarity, PostHog, Plausible, Vercel, Meta Pixel), or [Analytics Setup](/docs/analytics-setup.html) for the quick reference. Use the ingest scripts to add secrets: <code>bun run ingest:ga4</code>, <code>bun run ingest:clarity</code>, <code>bun run ingest:posthog</code>, <code>bun run ingest:plausible</code>, <code>bun run ingest:vercel-sync</code>.

For production, add these as Vercel Environment Variables in the project settings. They'll be injected at build time.

### Pages

| Route | Description |
|---|---|
| `/` | Homepage — bio, selected work, editorial note |
| `/posts` | Post archive — reverse chronological listing |
| `/posts/:slug` | Individual post (SSG at build time) |
| `/who-are-you` | Live visitor profiling + your event history (when `NEXT_PUBLIC_ANALYTICS_API_URL` is set) |

### Deployment

| Event | What happens |
|-------|--------------|
| Push to `main` | GitHub Actions CI runs Rust checks (`cargo check`, `clippy`, `test`, `build --release`); Vercel deploys to production |
| Open or update a PR | CI runs Rust checks; Vercel posts a deploy preview URL on the PR |
| Merge a PR | Vercel deploys the merged result to [jdetle.com](https://jdetle.com) |

**Vercel:** Connects via GitHub integration. Production deploys run automatically on push to `main`. PR preview URLs (e.g. `rust-blog-abc123.vercel.app`) are posted as comments. Next.js handles routing — no `vercel.json` needed.

**CI:** `.github/workflows/ci.yml` validates Rust (`cargo check`, `cargo clippy -- -D warnings`, `cargo test`, `cargo build --release`, benches) and the Next.js app (`bun test lib`, `bun run build`) on every push and PR.

**E2E preview (`e2e-preview.yml`):** After the deploy-preview smoke test, an optional step runs `bun run verify:analytics-read-apis` when you configure at least one complete provider in GitHub **Secrets**: PostHog (`POSTHOG_PERSONAL_API_KEY` + `POSTHOG_PROJECT_ID`), `CLARITY_EXPORT_TOKEN`, `ANALYTICS_API_URL` (warehouse `GET /health`), or Plausible (`PLAUSIBLE_API_KEY` plus `PLAUSIBLE_SITE_ID` or `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`). The script only GETs read endpoints (Clarity export, Plausible aggregate, warehouse health) or PostHog HogQL counts; it skips providers with missing env. Optional repository **Variables** `POSTHOG_VERIFY_HOURS`, `POSTHOG_VERIFY_ATTEMPTS`, and `POSTHOG_VERIFY_DELAY_MS` tune PostHog retries.
