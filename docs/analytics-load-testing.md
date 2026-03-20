# Load and soak testing — analytics ingestion

Use these checks before scaling traffic or changing aggregation. See [`plans/analytics-perf-adversarial-tests.md`](../plans/analytics-perf-adversarial-tests.md) for SLO targets and known weaknesses.

## Prerequisites

- Ingestion running locally or on staging: `cargo run --bin analytics-ingestion` (default `http://127.0.0.1:8080`).
- Optional: [k6](https://k6.io/docs/getting-started/installation/) for scripted scenarios.
- Optional: [oha](https://github.com/hatoo/oha) for quick HTTP floods.

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `BASE_URL` | `http://127.0.0.1:8080` | Ingestion base URL (k6) |
| `K6_SESSION_ID` | `load-test-user` | `session_id` / distinct_id for `GET /user-events` |

## k6 (concurrent ingest + read)

From the repo root:

```bash
k6 run scripts/analytics-load.k6.js
```

This ramps virtual users that `POST` small JSON events and occasionally `GET /user-events` for the same session. Watch for high `http_req_failed`, growing latency, or Cosmos throttling (5xx).

## oha (quick burst)

**Ingest only:**

```bash
oha -n 5000 -c 100 -m POST \
  -d '{"event_type":"load_test","page_url":"https://example.com/l","session_id":"oha-1"}' \
  -H "Content-Type: application/json" \
  http://127.0.0.1:8080/api/events
```

**Read path (after seeding events with that `session_id`):**

```bash
oha -n 2000 -c 50 \
  "http://127.0.0.1:8080/user-events?fingerprint=oha-1&limit=50"
```

## Forward-path soak (PostHog)

Ingest returns `202` before the PostHog capture call finishes (`tokio::spawn`). For a soak:

1. Point `POSTHOG_API_KEY` at a test project or mock.
2. Run k6 or oha for **several minutes** at sustained RPS.
3. Watch process **RSS** and **open sockets**; unbounded spawns can grow memory if PostHog is slow or rate-limits.

Compare stored Cosmos row counts with PostHog event counts — mismatches indicate silent forward failures.

## Rust micro-benchmarks

```bash
cargo bench --bench event_parse
```

## Interpretation

| Symptom | Likely cause |
|---------|----------------|
| 5xx under load | Cosmos RU limits, connection pool exhaustion |
| Ingest fast, reads slow | `ALLOW FILTERING` / index mismatch on `session_id` |
| Memory climb during long oha/k6 | Fire-and-forget PostHog forwards stacking up |
