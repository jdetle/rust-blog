---
title: Analytics aggregation performance and adversarial tests
status: accepted
created: 2026-03-19T12:00:00
updated: 2026-03-19T12:00:00
pr: ""
supersedes: ""
---

# Analytics aggregation: SLOs, tooling, and adversarial failure modes

This document captures **service-level objectives** (targets, not guarantees), **tooling** used to measure and stress the Rust analytics stack, and **known weaknesses** the test suite is designed to expose.

## Architecture under test

- **Binary**: `analytics-ingestion` — Axum HTTP + Tokio aggregation loop ([`src/bin/analytics_ingestion.rs`](../src/bin/analytics_ingestion.rs)).
- **Pull path**: Clarity export + PostHog Events API → Cosmos (Scylla API) ([`src/aggregate.rs`](../src/aggregate.rs)).
- **Push path**: `POST /api/events` → Cosmos; optional PostHog capture forward ([`src/api.rs`](../src/api.rs), [`src/forward.rs`](../src/forward.rs)).

## SLOs (targets for staging / production)

| Metric | Target | Notes |
|--------|--------|--------|
| Ingest `POST /api/events` p99 latency | &lt; 500 ms | Excludes downstream PostHog forward (async spawn). |
| `GET /user-events` p99 | &lt; 800 ms | Degrades if `ALLOW FILTERING` scans grow. |
| Aggregation freshness | Events from providers visible within **15 min + pull duration** | Pull interval is 15 minutes ([`spawn_aggregation_loop`](../src/aggregate.rs)); not realtime. |
| PostHog pull completeness | No silent drop beyond **100 events per request** | Current client uses `limit=100` with no pagination. |
| Ingest availability | 99.9% 2xx on healthy Cosmos | RU throttling shows as 5xx. |

## Tooling

| Layer | Tool | Purpose |
|-------|------|---------|
| Unit / property | `proptest`, pure helpers in [`src/aggregate_mapping.rs`](../src/aggregate_mapping.rs) | No panics on malformed timestamps; Clarity/PostHog JSON shapes. |
| HTTP contract | `wiremock` + [`Aggregator::with_endpoints`](../src/aggregate.rs) | Mock Clarity/PostHog without real credentials. |
| Micro-benchmarks | Criterion ([`benches/event_parse.rs`](../benches/event_parse.rs)) | Serde / mapping hot paths. |
| Load | [k6](https://k6.io/) ([`scripts/analytics-load.k6.js`](../scripts/analytics-load.k6.js)), [oha](https://github.com/hatoo/oha) | Concurrent ingest + user-events; document in [`docs/analytics-load-testing.md`](../docs/analytics-load-testing.md). |
| Profiling (manual) | `cargo flamegraph`, `perf`, Instruments | CPU in serde vs scylla driver after load repro. |

## Known failure modes (adversarial hypotheses)

1. **Polling lag**: 15-minute interval → bounded staleness for pull-based data.
2. **PostHog cap**: `limit=100` → incomplete backfill for busy days.
3. **Hardcoded project id**: Default URL uses project `1` unless `POSTHOG_PROJECT_ID` set.
4. **Clarity shape**: Only top-level JSON **arrays** ingested; object-wrapped responses store nothing.
5. **Idempotency**: Re-pulls insert **new** `event_id` (UUID) rows → duplicate logical events in storage.
6. **Cosmos RU**: Per-row inserts under fan-in → throttling under load.
7. **Query**: `session_id` query uses `ALLOW FILTERING` → scan cost at scale.
8. **Forward durability**: PostHog capture failures are logged only; ingest can succeed while forward fails.
9. **Unbounded forwards**: `tokio::spawn` per event → task buildup if PostHog is slow (soak test).

## Related plans

- [`analytics-multi-source.md`](./analytics-multi-source.md) — provider feasibility.
- [`analytics-fingerprint-unified-table.md`](./analytics-fingerprint-unified-table.md) — unified table design.
