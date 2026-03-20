/**
 * Server-side PostHog API client for fetching events.
 * Uses Personal API Key (phx_...) — never expose to client.
 *
 * - fetchEventsByQuery: HogQL Query API — multi-identifier in one call, up to 50k rows
 * - fetchEventsByDistinctId: Events API fallback (deprecated)
 */

const POSTHOG_API_BASE = "https://us.posthog.com";

export interface PostHogEvent {
	id: string;
	distinct_id: string;
	event: string;
	timestamp: string;
	properties?: Record<string, unknown>;
}

export interface PostHogEventsResponse {
	next?: string;
	results: PostHogEvent[];
}

export interface PostHogQueryRow {
	event?: string;
	distinct_id?: string;
	timestamp?: string;
	"properties.$current_url"?: string;
	"properties.$referrer"?: string;
	"properties.$user_agent"?: string;
}

/**
 * Fetch events via HogQL Query API. Queries by all identifiers in one request.
 * Preferred over Events API for multi-identifier and higher limits (50k rows).
 */
export async function fetchEventsByQuery(
	identifiers: string[],
	options: {
		personalApiKey: string;
		projectId: string;
		limit?: number;
		daysBack?: number;
	},
): Promise<PostHogEvent[]> {
	const { personalApiKey, projectId, limit = 100, daysBack = 30 } = options;
	if (!personalApiKey || !projectId || identifiers.length === 0) return [];

	const escaped = identifiers
		.filter((s) => s.length > 0)
		.map((s) => `'${s.replace(/'/g, "''")}'`)
		.join(", ");
	if (!escaped) return [];

	const hogql = `SELECT event, distinct_id, timestamp, properties.$current_url, properties
	FROM events
	WHERE distinct_id IN (${escaped})
		AND timestamp >= now() - INTERVAL ${daysBack} DAY
	ORDER BY timestamp DESC
	LIMIT ${Math.min(limit, 50_000)}`;

	const path = `/api/projects/${encodeURIComponent(projectId)}/query/`;
	const url = new URL(path, POSTHOG_API_BASE);

	const res = await fetch(url.href, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${personalApiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			query: {
				kind: "HogQLQuery",
				query: hogql,
			},
			name: "my-events-query",
		}),
		next: { revalidate: 60 },
	});

	if (!res.ok) {
		if (res.status === 401 || res.status === 403) {
			console.warn(
				"PostHog Query API auth failed — check POSTHOG_PERSONAL_API_KEY",
			);
		}
		return [];
	}

	const data = (await res.json()) as {
		columns?: string[];
		results?: unknown[][];
		error?: string;
	};

	if (data.error) {
		console.warn("PostHog Query API error:", data.error);
		return [];
	}

	const results = data.results ?? [];
	const columns = data.columns ?? [];
	const eventIdx = columns.indexOf("event");
	const distinctIdx = columns.indexOf("distinct_id");
	const tsIdx = columns.indexOf("timestamp");
	const urlIdx = columns.findIndex(
		(c) => c === "$current_url" || c === "properties.$current_url",
	);
	const propsIdx = columns.indexOf("properties");

	const events: PostHogEvent[] = [];
	for (const row of results) {
		const event = String(row[eventIdx] ?? "unknown");
		const distinct_id = String(row[distinctIdx] ?? "");
		const timestamp = row[tsIdx];
		const tsStr =
			typeof timestamp === "string"
				? timestamp
				: timestamp instanceof Date
					? timestamp.toISOString()
					: String(timestamp ?? "");
		const props: Record<string, unknown> =
			typeof row[propsIdx] === "object" && row[propsIdx] !== null
				? (row[propsIdx] as Record<string, unknown>)
				: {};
		if (urlIdx >= 0 && row[urlIdx] != null) {
			(props as { $current_url?: unknown }).$current_url = row[urlIdx];
		}
		events.push({
			id: `ph-${tsStr}-${event}-${distinct_id}`,
			distinct_id,
			event,
			timestamp: tsStr,
			properties: props,
		});
	}
	return events;
}

/**
 * Fetch events via deprecated Events API (fallback when Query API fails).
 */
export async function fetchEventsByDistinctId(
	distinctId: string,
	options: {
		personalApiKey: string;
		projectId: string;
		limit?: number;
		after?: string;
	},
): Promise<PostHogEvent[]> {
	const { personalApiKey, projectId, limit = 50, after } = options;
	if (!personalApiKey || !projectId) return [];

	const path = `/api/projects/${encodeURIComponent(projectId)}/events/`;
	const url = new URL(path, POSTHOG_API_BASE);
	url.searchParams.set("distinct_id", distinctId);
	url.searchParams.set("limit", String(Math.min(limit, 100)));
	if (after) url.searchParams.set("after", after);

	const res = await fetch(url.href, {
		headers: { Authorization: `Bearer ${personalApiKey}` },
		next: { revalidate: 60 },
	});

	if (!res.ok) {
		if (res.status === 401 || res.status === 403) {
			console.warn("PostHog API auth failed — check POSTHOG_PERSONAL_API_KEY");
		}
		return [];
	}

	const data = (await res.json()) as PostHogEventsResponse;
	const events = data.results ?? [];
	return events;
}

/**
 * HogQL: count events in the project within the last `hours` hours.
 * Used by CI to verify preview smoke produced PostHog-ingestible traffic.
 */
export async function fetchEventCountRecentHours(
	hours: number,
	options: { personalApiKey: string; projectId: string },
): Promise<number | null> {
	const { personalApiKey, projectId } = options;
	if (!personalApiKey || !projectId) return null;

	const safeHours = Math.min(Math.max(Math.floor(hours), 1), 168);
	const hogql = `SELECT count() AS c FROM events WHERE timestamp > now() - INTERVAL ${safeHours} HOUR`;

	const path = `/api/projects/${encodeURIComponent(projectId)}/query/`;
	const url = new URL(path, POSTHOG_API_BASE);

	const res = await fetch(url.href, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${personalApiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			query: {
				kind: "HogQLQuery",
				query: hogql,
			},
			name: "ci-recent-count",
		}),
	});

	if (!res.ok) {
		console.error(`PostHog Query API HTTP ${res.status}`);
		return null;
	}

	const data = (await res.json()) as {
		columns?: string[];
		results?: unknown[][];
		error?: string;
	};

	if (data.error) {
		console.error("PostHog Query API error:", data.error);
		return null;
	}

	const columns = data.columns ?? [];
	const results = data.results ?? [];
	const cIdx = columns.indexOf("c");
	if (cIdx < 0 || results.length === 0) {
		return null;
	}
	const raw = results[0]?.[cIdx];
	if (typeof raw === "number" && Number.isFinite(raw)) return raw;
	if (typeof raw === "string") {
		const n = Number.parseInt(raw, 10);
		return Number.isFinite(n) ? n : null;
	}
	return null;
}
