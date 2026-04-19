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
