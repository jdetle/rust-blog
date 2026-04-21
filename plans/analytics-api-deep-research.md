---
title: Analytics Provider APIs — Deep Research for Maximum Data Collection
status: proposed
created: 2026-03-17
updated: 2026-03-17
pr: ""
supersedes: ""
---

# Analytics Provider APIs — Deep Research for Maximum Data Collection

## Goal

Create the **largest possible dataset** by aggregating (union) all event-level and aggregate data from every analytics provider API. This document details each API's capabilities, limits, query patterns, and the intersection of fields we can normalize across sources.

---

## Executive Summary: What Each Provider Can Contribute

| Provider | Event-level per user? | Aggregate data? | Max volume / limits | Key identifier |
|----------|------------------------|-----------------|---------------------|----------------|
| **PostHog** | Yes (Events API, Query API) | Yes (HogQL) | 50k rows/query; 1-year range | distinct_id |
| **Warehouse (ScyllaDB)** | Yes | Yes | Our control | session_id (fp/user_id/distinct_id) |
| **Web analytics drain** | Yes (push) | N/A | All events pushed | deviceId (map to fp) |
| **GA4 BigQuery** | Yes (export) | Yes (Data API) | Full export | user_id, user_pseudo_id |
| **GA4 Data API** | Partial (aggregate reports) | Yes | 9 dimensions, 10 metrics/request | eventName, but no per-user in reports |
| **Clarity** | No | Yes (1–3 days) | 10 req/day, 1k rows, 3 dimensions | N/A — aggregate only |
| **Plausible** | No (Enterprise: raw export) | Yes | 600 req/hr; no per-visitor | N/A — aggregate only |
| **Meta CAPI** | No | No | Send-only | N/A — no pull API |

---

## 1. PostHog

### APIs Available

| API | Endpoint | Per-user? | Limits | Best for |
|-----|----------|-----------|--------|----------|
| **Events API** (deprecated) | `GET /api/projects/:id/events/?distinct_id=X` | Yes | 24h default, 1-year max range, 50k offset cap | Quick distinct_id lookup |
| **Query API (HogQL)** | `POST /api/projects/:id/query/` | Yes | 100 default, 50k max rows/query | Flexible SQL, multi-distinct_id via `IN` |
| **Batch Exports** | CDP → S3, BigQuery, etc. | Yes | Full history, batched | Large-scale export |

### Query API (Recommended)

```sql
SELECT event, distinct_id, timestamp, properties.$current_url, properties.$referrer, properties.$user_agent
FROM events
WHERE distinct_id IN ('fp1', 'fp2', 'user_id_1')
  AND timestamp >= now() - INTERVAL 30 DAY
LIMIT 50000
```

- Use `distinct_id IN (...)` to query multiple identifiers in one request
- Paginate via `timestamp` (e.g. `AND timestamp < :last_seen`) for >50k rows
- Include short time ranges to improve performance

### Fields to Extract (Union with Other Sources)

| Field | PostHog | Normalize to |
|-------|---------|--------------|
| event | event name | event_type |
| distinct_id | user id | fingerprint/user_id/distinct_id |
| timestamp | ISO string | event_time (ms) |
| properties.$current_url | page URL | page_url |
| properties.$referrer | referrer | referrer |
| properties.$user_agent | UA | user_agent |
| properties.* | custom props | properties (JSON) |

---

## 2. Host web analytics drain

### Mechanism

- **Push only** — no pull/query API
- Configure drain destination (HTTPS endpoint) in your analytics host dashboard
- Events sent as JSON array or NDJSON
- `beforeSend` can augment payload (e.g. add `fingerprint`)

### Example payload schema (vendor-specific; illustrative)

| Field | Type | Description |
|-------|------|-------------|
| schema | string | e.g. `host.analytics.v1` (vendor-defined) |
| eventType | string | `pageview` \| `event` |
| eventName | string | Custom event name |
| eventData | string | JSON string of custom data |
| timestamp | number | Unix ms |
| projectId | string | Analytics project ID |
| ownerId | string | Project owner |
| sessionId | number | Session ID (often 0 in prod) |
| deviceId | number | Persistent device ID |
| origin | string | Origin URL |
| path | string | Path |
| referrer | string | Referrer |
| queryParams | string | URL query |
| route | string | Route pattern |
| country | string | Country code |
| region | string | Region |
| city | string | City |
| osName | string | OS |
| clientName | string | Browser |
| deviceType | string | desktop \| mobile \| tablet |
| deviceBrand | string | Device brand |
| deviceModel | string | Device model |
| deployment | string | Deployment ID |

### Maximizing Data

1. **Inject fingerprint** via `beforeSend`: `return { ...event, fingerprint: fp }` — verify drain receives it
2. **Store all fields** — geographic, device, and URL data enrich the unified schema
3. **Map deviceId → fingerprint** — if fingerprint not in payload, build a mapping table (deviceId ↔ fingerprint) from overlap with PostHog/warehouse

---

## 3. GA4 — BigQuery Export

### Schema (events_YYYYMMDD)

| Field | Type | Description |
|-------|------|-------------|
| event_name | STRING | Event name |
| event_timestamp | INTEGER | Microseconds UTC |
| event_date | STRING | YYYYMMDD |
| user_pseudo_id | STRING | GA client ID |
| user_id | STRING | Custom (set via gtag) |
| geo.country | STRING | Country |
| geo.region | STRING | Region |
| geo.city | STRING | City |
| device.category | STRING | mobile \| desktop \| tablet |
| traffic_source.source \| medium \| name | STRING | Attribution |
| event_params | RECORD (repeated) | Key-value pairs |

### Per-User Query

```sql
SELECT event_name, event_timestamp, user_pseudo_id, user_id,
       (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') AS page_url
FROM `project.analytics_*.events_*`
WHERE user_id = @fingerprint
   OR user_pseudo_id = @fingerprint
```

### Client Setup for Maximum Data

- `gtag('set', 'user_id', fingerprint)` before first event
- Enable GA4 → BigQuery export (daily or streaming)
- Query by `user_id` (fingerprint) and `user_pseudo_id` for anonymous-first-touch

---

## 4. GA4 — Data API (runReport)

### Constraints

- **Aggregate reports only** — no raw event export
- Up to **9 dimensions** and **10 metrics** per request
- Dimensions: `eventName`, `date`, `country`, `deviceCategory`, `browser`, etc.
- **No `user_pseudo_id` or `user_id`** as dimension in standard runReport — reports are aggregated

### Use Case

- Site-wide metrics (pageviews, bounce rate, top pages)
- Breakdown by country, device, landing page
- **Not** for per-user event lists — use BigQuery for that

---

## 5. Microsoft Clarity Data Export API

### Endpoint

```
GET https://www.clarity.ms/export-data/api/v1/project-live-insights?numOfDays=1&dimension1=URL&dimension2=OS&dimension3=Device
```

### Limits

- **10 requests per project per day**
- **1–3 days** of data (`numOfDays`: 1, 2, 3)
- **1,000 rows max** per response, no pagination
- Up to **3 dimensions** per request

### Dimensions

URL, Channel, Campaign, Medium, Source, OS, Country/Region, Device, Browser

### Metrics

Traffic, Engagement Time, Scroll Depth, Rage Click Count, Dead Click Count, Error Click Count, Script Error Count, Quickback Click, Excessive Scroll, Referrer URL, Page Title, Popular Pages

### Response Shape (Aggregate)

```json
[
  {
    "metricName": "Traffic",
    "information": [
      {
        "totalSessionCount": "9554",
        "totalBotSessionCount": "8369",
        "distantUserCount": "189733",
        "PagesPerSessionPercentage": 1.0931,
        "OS": "Other"
      }
    ]
  }
]
```

### Maximizing Data

- Run **3-dimension** queries (e.g. URL × OS × Device) to get finer breakdowns
- Use all 10 daily requests across different dimension combinations
- **No per-user export** — use for aggregate enrichment (e.g. rage clicks by URL) attached to site-level context

---

## 6. Plausible Stats API

### Endpoint

```
POST https://plausible.io/api/v2/query
```

### Metrics

visitors, visits, pageviews, bounce_rate, visit_duration, events, scroll_depth, conversion_rate, etc.

### Dimensions

`event:page`, `event:goal`, `visit:entry_page`, `visit:source`, `visit:device`, `visit:browser`, etc.

### Limits

- **600 requests/hour** (default)
- **Aggregate only** — no per-visitor or per-session export
- Enterprise: scheduled raw event exports (CSV)

### Maximizing Data

- Query by `event:page` for page-level breakdowns
- Use `visit:source`, `visit:device` for acquisition/device splits
- Dashboard CSV export: up to 300 entries (100 for page reports); full export via site settings
- **Not** for per-user event lists

---

## 7. Meta Conversions API

- **Send-only** — no API to pull or export events
- Data stays in Meta for ad optimization
- **Omit** from unified event aggregation

---

## 8. Union Schema: Largest Possible Dataset

Normalize all sources into a common event row:

| Column | Type | PostHog | Web analytics drain | GA4 BQ | Warehouse |
|--------|------|---------|--------------|--------|-----------|
| event_id | TEXT | id | generate | generate | event_id |
| event_type | TEXT | event | eventType/eventName | event_name | event_type |
| event_time | BIGINT | timestamp ms | timestamp | event_timestamp/1e3 | event_time |
| event_date | STRING | YYYY-MM-DD | derived | event_date | event_date |
| page_url | TEXT | $current_url | origin+path | page_location | page_url |
| referrer | TEXT | $referrer | referrer | (event_params) | referrer |
| user_agent | TEXT | $user_agent | — | — | user_agent |
| source | TEXT | posthog | web_analytics | ga4 | warehouse |
| fingerprint | TEXT | distinct_id | fingerprint/deviceId | user_id | session_id |
| country | TEXT | — | country | geo.country | — |
| region | TEXT | — | region | geo.region | — |
| city | TEXT | — | city | geo.city | — |
| device_type | TEXT | — | deviceType | device.category | — |
| os_name | TEXT | — | osName | — | — |
| browser | TEXT | — | clientName | — | — |
| properties | JSON | properties | eventData + flags | event_params | properties |

### Deduplication Key

Use `(source, event_type, page_url, event_date, event_time)` — or include a hash of fingerprint when available — to deduplicate across providers. Same real-world event may appear in PostHog and the web-analytics drain; keep one canonical row.

---

## 9. Recommended Ingestion Pipeline for Maximum Data

### Tier 1: Per-User Event-Level (Union)

1. **PostHog** — Query API by fingerprint, user_id, distinct_id (3 queries, merge)
2. **Warehouse** — Query by fingerprint, user_id, distinct_id (3 queries, merge)
3. **Web analytics drain** — Ingest endpoint stores events; query by fingerprint/deviceId when available
4. **GA4 BigQuery** — Scheduled job queries by user_id and user_pseudo_id; insert into warehouse

### Tier 2: Aggregate Enrichment (Attach to Site/Time)

5. **Clarity** — Pull aggregate metrics (3 dimensions × 10 req/day); store as site-level rollups
6. **Plausible** — Pull breakdowns by page, source, device; store as site-level rollups
7. **GA4 Data API** — Pull runReport for site metrics; attach to time buckets

### Tier 3: No Contribution

8. **Meta** — Send-only; omit from aggregation

---

## 10. Implementation Checklist

- [x] PostHog: Migrate to Query API (HogQL) with `distinct_id IN (...)` for 3-identifier fetch
- [ ] PostHog: Add timestamp pagination for >50k events
- [x] Web analytics: Configure drain → `POST /api/drain/web-analytics`; add `beforeSend` fingerprint injection
- [ ] GA4: Enable BigQuery export; schedule job to query by user_id/user_pseudo_id
- [ ] GA4: Add `gtag('set', 'user_id', fingerprint)` on client
- [x] Clarity: Already pulling aggregate (10 req/day)
- [ ] Plausible: Add breakdown queries for site-level enrichment
- [x] Unified store: my-events queries warehouse + PostHog by all 3 identifiers, dedupes

---

## 11. References

- [PostHog Query API](https://posthog.com/docs/api/queries)
- [PostHog Batch Exports](https://posthog.com/docs/cdp/batch-exports)
- Web analytics drain schema (vendor documentation for your host)
- [GA4 BigQuery Schema](https://support.google.com/analytics/answer/7029846)
- [GA4 Data API Schema](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema)
- [Clarity Data Export API](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export-api)
- [Plausible Stats API](https://plausible.io/docs/stats-api)
