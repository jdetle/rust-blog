# Playwright E2E

## Setup

```bash
bun run test:e2e:install   # Chromium only (see playwright.config.ts)
```

## PostHog (`posthog.spec.ts`)

The suite starts its own `next dev` on port **3005** by default so it does not reuse a random process on `:3000` that was built without PostHog env.

**Required in the environment** when running the PostHog test (or in `.env.local` loaded by Next):

- `NEXT_PUBLIC_POSTHOG_KEY` — project API key (`phc_...`)

Example:

```bash
NEXT_PUBLIC_POSTHOG_KEY=phc_… bun run test:e2e:posthog
```

CI: add `NEXT_PUBLIC_POSTHOG_KEY` to the workflow env or secrets for this job.

Optional: `PLAYWRIGHT_PORT` / `BASE_URL` if you point at an already-running server; set `PLAYWRIGHT_REUSE_SERVER=1` only when reusing that server.

## E2E Preview workflow — PostHog ingestion check

After GET smoke tests, [`.github/workflows/e2e-preview.yml`](../.github/workflows/e2e-preview.yml) can run `bun run verify:posthog-ingestion` when these **repository secrets** are set:

| Secret | Purpose |
|--------|---------|
| `POSTHOG_PERSONAL_API_KEY` | HogQL Query API (`phx_…`) |
| `POSTHOG_PROJECT_ID` | Numeric PostHog project id |

The script counts events in the last 2 hours (configurable via `POSTHOG_VERIFY_HOURS`) and retries with backoff so short query lag does not flake the job.
