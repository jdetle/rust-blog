### jdetle.com

Personal blog and journal by John Detlefs. Next.js App Router frontend deploys to Azure App Service. Rust analytics-ingestion service runs on Azure Container Apps to pull events from Clarity/PostHog into Cosmos DB.

### Architecture

```
app/                   Next.js App Router pages (SSG + dynamic)
components/            React components (analytics, nav, profiling)
content/posts/         Raw HTML blog posts (source of truth)
lib/                   Server-side utilities (post parser, analytics)
middleware.ts          Edge Middleware for UTM/referrer tracking
posts/blog.css         Shared wabi-sabi stylesheet
src/                   Rust analytics ingestion (Cosmos, Clarity, PostHog)
```

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15 App Router on Azure App Service |
| Analytics ingestion | Rust binary — HTTP API + Clarity/PostHog → Cosmos DB |

### Azure architecture

The production stack is split across Azure services with Cloudflare in front:

```text
Cloudflare DNS / proxy
  -> Azure App Service (Linux B1)
     -> Next.js 15 standalone server
     -> reads runtime blog content from posts/
     -> calls Rust APIs through ANALYTICS_API_URL and RUST_API_URL

Azure Container Apps
  -> ca-rust-blog        (analytics ingestion / warehouse APIs)
  -> ca-rust-api         (small Axum API surfaced through /api/rust/* proxies)

Shared Azure services
  -> Cosmos DB           (analytics storage)
  -> Azure Container Registry
  -> optional Key Vault  (runtime secrets for Rust services)
```

Operationally, that means:

- `jdetle.com` and `www.jdetle.com` terminate at Cloudflare
- Cloudflare forwards traffic to the Azure App Service hostname
- the Next.js frontend is the only public web origin for the site
- Rust services stay isolated behind Azure-managed endpoints and are consumed by the frontend through environment variables

### Running (Next.js — frontend)

```bash
bun install
bun run dev
```

Open http://localhost:3000.

**CI — PostHog ingestion check (optional):** After deploy smoke, the E2E Preview workflow can run `bun run verify:posthog-ingestion` when repository secrets `POSTHOG_PERSONAL_API_KEY` and `POSTHOG_PROJECT_ID` are set. See [e2e/README.md](e2e/README.md).

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

### Deploying

#### Frontend (Azure App Service)

The production site deploys to Azure App Service via `.github/workflows/deploy-vercel.yml` (the file name is legacy; the workflow now targets Azure). The workflow builds a standalone Next.js artifact, includes the `posts/` content read at runtime, and deploys a zip package to a Linux web app.

Provision the web app in the `rust-blog` subscription using:

1. **Resource group:** `rg-rust-blog`
2. **Plan:** Linux B1
3. **Runtime stack:** Node 20 LTS
4. **Startup command:** `node server.js`
5. **App settings:** `SCM_DO_BUILD_DURING_DEPLOYMENT=false`, `WEBSITE_RUN_FROM_PACKAGE=1`, `PORT=8080`

Add these GitHub Actions secrets:

- `AZUREAPPSERVICE_CLIENTID`
- `AZUREAPPSERVICE_TENANTID`
- `AZUREAPPSERVICE_SUBSCRIPTIONID`
- `AZUREAPPSERVICE_RG`
- `AZUREAPPSERVICE_NAME`

See [docs/azure-deployment.md](docs/azure-deployment.md) for the exact portal steps.

#### Analytics ingestion (Azure Container Apps)

The analytics-ingestion service deploys to Azure Container Apps via `.github/workflows/deploy-azure.yml`. Prerequisites:

1. Create an Azure Container Registry (ACR), resource group, and Container App with env vars: `COSMOS_CONTACT_POINT`, `COSMOS_USERNAME`, `COSMOS_PASSWORD`, `POSTHOG_API_KEY`
2. Add GitHub secrets: `AZURE_CREDENTIALS` (service principal JSON)
3. Add GitHub variables: `ACR_NAME`, `AZURE_RESOURCE_GROUP`, `CONTAINER_APP_NAME`
4. Set `ANALYTICS_API_URL` in Azure App Service application settings to your Container App URL (e.g. `https://analytics-ingestion.xxx.azurecontainerapps.io`). `NEXT_PUBLIC_ANALYTICS_API_URL` with the same value still works as a legacy alias.

**rust-api:** The small Axum service in `rust-api/` deploys to Azure as `ca-rust-api` (see `.github/workflows/deploy-rust-api.yml`). Set **`RUST_API_URL`** in Azure App Service application settings to that Container App’s HTTPS origin (no trailing slash), e.g. `https://ca-rust-api.<random>.eastus2.azurecontainerapps.io`. The site exposes **`GET /api/rust/health`**, **`/api/rust/ready`**, **`/api/rust/v1/info`** as server proxies to the Container App.

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

Use the ingest scripts to add secrets: <code>bun run ingest:ga4</code>, <code>bun run ingest:clarity</code>, <code>bun run ingest:posthog</code>, <code>bun run ingest:plausible</code>, <code>bun run ingest:vercel-sync</code>.

For production, add these as Azure App Service application settings. Public `NEXT_PUBLIC_*` values are still baked into the Next.js build; server-only values are available at runtime.

### Pages

| Route | Description |
|---|---|
| `/` | Homepage — bio, selected work, editorial note |
| `/posts` | Post archive — reverse chronological listing |
| `/posts/:slug` | Individual post (SSG at build time) |
| `/who-are-you` | Live visitor profiling + your event history (when `ANALYTICS_API_URL` or legacy `NEXT_PUBLIC_ANALYTICS_API_URL` is set) |

### Deployment

| Event | What happens |
|-------|--------------|
| Push to `main` | GitHub Actions CI runs Rust checks (`cargo check`, `clippy`, `test`, `build --release`) and deploys the frontend to Azure App Service |
| Open or update a PR | CI runs Rust and Next.js validation |
| Merge a PR | Azure App Service serves the merged result at [jdetle.com](https://jdetle.com) |

**Azure App Service:** GitHub Actions builds the standalone Next.js artifact and deploys `site.zip` to the Linux web app. App Service handles the Node runtime; Cloudflare provides DNS in front of it.

**CI:** `.github/workflows/ci.yml` validates Rust (`cargo check`, `cargo clippy -- -D warnings`, `cargo test`, `cargo build --release`, benches) and the Next.js app (`bun test lib`, `bun run build`) on every push and PR.

**E2E preview (`e2e-preview.yml`):** After the deploy-preview smoke test, an optional step runs `bun run verify:analytics-read-apis` when you configure at least one complete provider in GitHub **Secrets**: PostHog (`POSTHOG_PERSONAL_API_KEY` + `POSTHOG_PROJECT_ID`), `CLARITY_EXPORT_TOKEN`, `ANALYTICS_API_URL` (warehouse `GET /health`), or Plausible (`PLAUSIBLE_API_KEY` plus `PLAUSIBLE_SITE_ID` or `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`). The script only GETs read endpoints (Clarity export, Plausible aggregate, warehouse health) or PostHog HogQL counts; it skips providers with missing env. Optional repository **Variables** `POSTHOG_VERIFY_HOURS`, `POSTHOG_VERIFY_ATTEMPTS`, and `POSTHOG_VERIFY_DELAY_MS` tune PostHog retries.
