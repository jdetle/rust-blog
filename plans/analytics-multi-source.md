---
title: Multi-Source Analytics for Fingerprinted Sessions
status: proposed
created: 2026-03-17
updated: 2026-03-17
pr: ""
supersedes: ""
---

# Multi-Source Analytics for Fingerprinted Sessions

> **See also**: [analytics-fingerprint-unified-table.md](./analytics-fingerprint-unified-table.md) — full API research and unified table design (primary key = fingerprint).

## Goal

Associate every fingerprinted browser session with data from analytics providers (GA, Clarity, Plausible, PostHog, Vercel Analytics) and share that data with returning visitors.

## Provider API Feasibility

| Provider | Per-user query? | How to associate | Notes |
|----------|-----------------|------------------|-------|
| **PostHog** | Yes | distinct_id (we set), device_fingerprint property | Events API supports distinct_id filter (deprecated but works). Persons batch_by_distinct_ids. |
| **Google Analytics 4** | No (Data API); Yes via BigQuery | user_id = fingerprint in gtag | Data API is aggregate. BigQuery export has user_pseudo_id. Requires GA4→BigQuery setup. |
| **Microsoft Clarity** | Partial | clarity("identify", fingerprint, sessionId) | Data Export API is aggregate. Identify tags sessions for dashboard filtering. No API to fetch "sessions for user X". |
| **Plausible** | No | N/A | Stats API returns aggregate metrics only. Privacy-focused; no per-visitor API. |
| **Vercel Analytics** | No query API | Web Analytics Drain | Configure drain to receive events. Must include fingerprint in custom props. Store ourselves, query by fingerprint. |

## Phased Approach

### Phase 1: PostHog (immediate)
- Add POSTHOG_PERSONAL_API_KEY to backend env (project API key has different scope).
- Extend analytics-ingestion or add Next.js API route: fetch from PostHog Events API by distinct_id.
- Merge PostHog events with existing ScyllaDB user-events in the who-are-you UI.
- Source attribution: "PostHog" vs "warehouse" (ScyllaDB).

### Phase 2: Clarity identity + Vercel drain (optional)
- Client: call clarity("identify", fingerprint, posthog.get_distinct_id()) when fingerprint ready.
- Clarity dashboard can filter by custom user id; no programmatic fetch of per-session data.
- Vercel: configure Web Analytics Drain → our ingest endpoint. beforeSend to add fingerprint. Store in ScyllaDB.

### Phase 3: GA4 + Plausible (aggregate only)
- GA4: Send user_id via gtag if we want future BigQuery queries. Heavy setup.
- Plausible: Show site-wide stats (visitors, top pages) as "your contribution to these numbers"—not per-user.

## Identity Linking Strategy

1. **First visit**: Fingerprint computed on who-are-you. Sent to PostHog (register), ScyllaDB (custom ingest), Clarity (identify).
2. **Return visit**: User has same fingerprint. We query PostHog by distinct_id, ScyllaDB by fingerprint. Merge and display.

## API Keys for analytics-ingestion

| Provider | Env var | Purpose | Pull? |
|----------|---------|---------|-------|
| **Vercel** | `VERCEL_TOKEN` | Drain config via API; drains PUSH to /api/events | No pull — receive |
| **Google** | `GOOGLE_APPLICATION_CREDENTIALS` | BigQuery query by user_pseudo_id (fingerprint) | Yes (BigQuery) |
| **Meta** | `META_ACCESS_TOKEN` | Conversion API (send server-side events) | No pull |
| **PostHog** | `POSTHOG_API_KEY`, `POSTHOG_PERSONAL_API_KEY` | Pull events by distinct_id | Yes |
| **Clarity** | `CLARITY_EXPORT_TOKEN` | Export API (aggregate) | Partial |

Ingest scripts: `bun run ingest:vercel-token`, `ingest:google-bigquery`, `ingest:meta-token`.

## Security & Privacy

- Personal API keys server-side only (never exposed to client).
- User sees only their own data; backend validates fingerprint/session before returning.
- Plausible/GA aggregate shown only as site-level context.
