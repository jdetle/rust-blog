# Adversarial review: ANALYTICS_API_URL for Next proxies (2026-04-14)

**Chaos mode:** high  
**Scope:** `getAnalyticsIngestionBaseUrl()` — prefer `ANALYTICS_API_URL`, fall back to `NEXT_PUBLIC_ANALYTICS_API_URL`; ingest script + docs.

## Offense

- **Two env names** could drift if set to different values; precedence must stay documented (primary wins).
- **Server URL in NEXT_PUBLIC_** legacy still supported — URL may be embedded in client if ever imported from client modules (not done here).

## Defense

- Single helper used by all three analytics proxy routes; trailing slash stripped; same behavior as before when only legacy was set.
- Ingest script removes duplicate legacy line when writing primary.

## Synthesis

- **Decision:** Proceed with push; fixes 503 when only `ANALYTICS_API_URL` is set (e.g. Vercel aligned with `.env.example`).
- **Unresolved risk:** none blocking.
- **Follow-up:** Remove `NEXT_PUBLIC_ANALYTICS_API_URL` from Vercel after confirming production uses `ANALYTICS_API_URL`.
