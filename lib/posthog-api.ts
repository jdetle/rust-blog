/**
 * Server-side PostHog API client for fetching events by distinct_id.
 * Uses Personal API Key (phx_...) — never expose to client.
 * Events API is deprecated but still functional; consider batch exports for long-term.
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
