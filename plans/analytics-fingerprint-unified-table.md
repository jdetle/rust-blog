---
title: Analytics API Research — Unified Fingerprint-Keyed Table
status: proposed
created: 2026-03-17
updated: 2026-03-17
pr: ""
supersedes: ""
---

# Analytics API Research — Unified Fingerprint-Keyed Table

## Summary

Research on each analytics provider's API and how to associate events with a user's fingerprint. Goal: collect all data in a **single table where the primary key is the user's fingerprint** for fast per-user lookups.

---

## 1. API Research Table (Primary Key = Fingerprint)

| Provider | Can query by fingerprint? | How to associate | API / mechanism | Limitations |
|----------|---------------------------|------------------|-----------------|-------------|
| **PostHog** | Yes | `distinct_id` = fingerprint via `posthog.identify(fp)` | `GET /api/projects/:id/events/?distinct_id=<fp>` (deprecated but works). HogQL: `SELECT * FROM events WHERE distinct_id = '<fp>'` | Events API deprecated; migrate to batch exports or Query API long-term |
| **Warehouse (ScyllaDB)** | Yes | `session_id` = fingerprint | Rust ingestor writes `session_id` from PostHog `distinct_id`. Custom ingest accepts `session_id` in payload | Already implemented. Index on `session_id` required |
| **Host web analytics** | Partial | Drain payload has `deviceId` (persistent), `sessionId` (often 0). No native fingerprint | Web analytics drain (push). `beforeSend` can augment event; add `fingerprint` via `{ ...event, fingerprint }` if drain passes custom props | deviceId ≠ our fingerprint. sessionId often 0 in prod. Must inject fingerprint client-side and verify drain includes it |
| **GA4 / BigQuery** | Yes (with setup) | `user_id` = fingerprint in gtag: `gtag('set', 'user_id', fingerprint)` | BigQuery export: `events_YYYYMMDD` has `user_id`, `user_pseudo_id`. Query: `SELECT * FROM events_* WHERE user_id = '<fp>'` | Requires GA4 → BigQuery export. `user_pseudo_id` is GA client ID, not fingerprint |
| **Microsoft Clarity** | No | `clarity("identify", fingerprint)` tags sessions in dashboard only | Data Export API: aggregate metrics by dimensions (URL, country, device). No per-user/session fetch | 10 req/project/day. No way to export "sessions for user X" |
| **Plausible** | No | N/A | Stats API: aggregate only (visitors, pageviews, bounce rate). Events API: send only | Privacy-focused; no per-visitor export |
| **Meta Conversions API** | No | Send-only | POST to Pixel; no pull/export API | No way to fetch events by user |

---

## 2. Fingerprint-First Table Schema

### Option A: Partition by Fingerprint (Cosmos Cassandra API)

For "get all events for user X" as the primary access pattern:

```cql
CREATE TABLE analytics.events_by_fingerprint (
  fingerprint TEXT,
  event_date INT,           -- days since epoch
  event_time BIGINT,        -- millis
  event_id UUID,
  event_type TEXT,
  source TEXT,
  page_url TEXT,
  user_agent TEXT,
  referrer TEXT,
  properties TEXT,
  PRIMARY KEY (fingerprint, event_date, event_time, event_id)
) WITH CLUSTERING ORDER BY (event_date DESC, event_time DESC, event_id ASC);
```

- **Partition key**: `fingerprint` — each user gets a partition; high cardinality = good distribution
- **Clustering**: `(event_date, event_time, event_id)` — efficient "recent first" queries
- **Query**: `SELECT * FROM events_by_fingerprint WHERE fingerprint = ? ORDER BY event_date DESC, event_time DESC LIMIT 100`

### Option B: Keep Current + Secondary Index (existing)

Current table `analytics.events`:
- PK: `(site_id, event_date, event_time, event_id)`
- Index: `session_id` (fingerprint)
- Query: `WHERE session_id = ?`

**Trade-off**: Secondary index scans can be slower than primary partition lookup. Option A is faster for fingerprint-first access but requires writing to two tables (or migrating).

### Recommendation

Use **Option A** for new fingerprint-centric workloads. Migrate existing `session_id` data into `events_by_fingerprint` and have all ingest pipelines write to both tables during transition, or write only to `events_by_fingerprint` and deprecate the old table if time-range analytics are less critical.

---

## 3. Per-Source Implementation Notes

### PostHog
- Client: `posthog.identify(fingerprint)` when fingerprint is ready
- Fetch: `GET /api/projects/{id}/events/?distinct_id={fingerprint}&limit=100`
- Store: `session_id` = fingerprint in warehouse; same for `events_by_fingerprint.fingerprint`

### Web analytics drain
- Client: `beforeSend`: `return { ...event, fingerprint: fp }` (fingerprint must be available when event fires)
- Drain endpoint: receives events; extract `fingerprint` from payload if present
- **Caveat**: Drain schema docs may not list `fingerprint`. Verify that custom props from beforeSend reach the drain. If not, use `eventData` for custom events only; pageviews may lack fingerprint unless the host adds support.

### GA4 BigQuery
- Client: `gtag('set', 'user_id', fingerprint)` before first event
- Ingest: Scheduled BigQuery job or Dataform; `SELECT * FROM \`project.analytics_*.events_*\` WHERE user_id = ?`
- Store: Insert into `events_by_fingerprint` with `source = 'ga4'`

### Clarity
- Client: `clarity("identify", fingerprint)` for dashboard filtering
- **No per-user export** — omit from unified table. Use only for aggregate insights.

### Meta / Plausible
- No per-user data. Omit from fingerprint table.

---

## 4. Unified Event Row Shape

All sources normalize to:

| Column | Type | Source mapping |
|--------|------|----------------|
| fingerprint | TEXT | distinct_id (PostHog), session_id (warehouse), user_id (GA4), payload.fingerprint (web analytics drain) |
| event_date | INT | days since 1970-01-01 |
| event_time | BIGINT | Unix ms |
| event_id | UUID | Generate on insert if not provided |
| event_type | TEXT | pageview, $pageview, custom event name |
| source | TEXT | posthog, warehouse, web_analytics, ga4 |
| page_url | TEXT | $current_url, path+origin, page_location |
| user_agent | TEXT | optional |
| referrer | TEXT | optional |
| properties | TEXT | JSON blob of raw properties |

---

## 5. Three-Table Aggregation (Current Implementation)

The `my-events` API queries by **all three identifiers** (fingerprint, user_id, distinct_id) when provided, aggregating from three conceptual tables:

| Table / query key | Warehouse (session_id) | PostHog (distinct_id) |
|-------------------|------------------------|------------------------|
| fingerprint       | Query 1                 | Query 1                 |
| user_id           | Query 2                 | Query 2                 |
| distinct_id       | Query 3                 | Query 3                 |

Results are deduplicated by `(source, event_type, page_url, event_date)` and merged. The client sends all three params when available to maximize data collection.

## 6. Current State vs Target

| Component | Current | Target |
|-----------|---------|--------|
| Warehouse query | `WHERE session_id = ?` × 3 (fingerprint, user_id, distinct_id) | Same; or `WHERE fingerprint = ?` (partition key) |
| PostHog fetch | 3 calls by each identifier, merge | Same |
| Web analytics | pull stub N/A | Drain endpoint; parse fingerprint from payload; write to events_by_fingerprint |
| GA4 | Not integrated | BigQuery job → events_by_fingerprint |
| my-events API | Fetches warehouse + PostHog by all 3 keys, merges | Query events_by_fingerprint only (or both during migration) |

---

## 7. Migration Path

1. **Create** `analytics.events_by_fingerprint` table
2. **Backfill**: Copy from `analytics.events` where `session_id` is non-empty; use `session_id` as `fingerprint`
3. **Update Rust ingestor**: Write to both tables (or only new table)
4. **Update drain handler**: Accept web-analytics drain events, extract fingerprint, insert into `events_by_fingerprint`
5. **Update my-events**: Prefer `events_by_fingerprint` when available; fallback to warehouse + PostHog during rollout
6. **Deprecate** old `session_id` index queries once migration is complete

---

## 8. Deep API Research

> **See also**: [analytics-api-deep-research.md](./analytics-api-deep-research.md) — full API capabilities, limits, query patterns, and union schema for maximum data collection across all providers.

## 9. References

- [PostHog Events API](https://posthog.com/docs/api/events) — `distinct_id` filter
- Host web analytics drain schema (see your analytics vendor) — deviceId, sessionId, eventData
- [GA4 BigQuery Export Schema](https://support.google.com/analytics/answer/7029846) — user_id, user_pseudo_id
- [Clarity Data Export API](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export-api) — aggregate only
- [Plausible Stats API](https://plausible.io/docs/stats-api) — aggregate only
- [Meta Conversions API](https://developers.facebook.com/docs/marketing-api/conversions-api) — send only
