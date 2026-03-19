/**
 * Meta Conversions API — send server-side events for ad optimization.
 * Uses aggregated events from warehouse/PostHog to enrich Meta's view of the user.
 */

const GRAPH_API = "https://graph.facebook.com/v21.0";

async function sha256Hex(input: string): Promise<string> {
	// Web Crypto API — available in Node 19+ and edge
	const encoder = new TextEncoder();
	const buf = await crypto.subtle.digest("SHA-256", encoder.encode(input));
	return Array.from(new Uint8Array(buf))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

export interface UnifiedEvent {
	event_id: string;
	event_type: string;
	source: string;
	page_url: string;
	event_date: string;
	event_time?: number;
}

const META_STANDARD_EVENTS = new Set([
	"PageView",
	"ViewContent",
	"Lead",
	"CompleteRegistration",
	"AddToCart",
	"Purchase",
	"Search",
	"Contact",
]);

function toMetaEventName(eventType: string): string {
	const lower = eventType.toLowerCase();
	if (
		lower === "pageview" ||
		lower === "page_view" ||
		lower === "$pageview" ||
		lower === "$page_view"
	)
		return "PageView";
	if (
		lower === "viewcontent" ||
		lower === "view_content" ||
		lower === "post_read"
	)
		return "ViewContent";
	if (lower === "lead") return "Lead";
	if (lower === "completeregistration" || lower === "complete_registration")
		return "CompleteRegistration";
	if (lower === "fingerprint") return "Lead"; // interest signal
	if (META_STANDARD_EVENTS.has(eventType)) return eventType;
	// Default page-like events to PageView
	if (lower.includes("page") || lower.includes("view")) return "PageView";
	return "PageView";
}

export interface SyncToMetaOptions {
	pixelId: string;
	accessToken: string;
	events: UnifiedEvent[];
	externalId: string; // fingerprint, distinct_id, or user_id — will be hashed
	clientIp?: string;
	clientUserAgent?: string;
}

export async function syncEventsToMeta(options: SyncToMetaOptions): Promise<{
	sent: number;
	skipped: number;
	error?: string;
}> {
	const {
		pixelId,
		accessToken,
		events,
		externalId,
		clientIp,
		clientUserAgent,
	} = options;

	if (!pixelId || !accessToken) {
		return {
			sent: 0,
			skipped: 0,
			error: "Meta Pixel ID and access token required",
		};
	}

	const hashedExternalId = await sha256Hex(externalId.trim().toLowerCase());

	const data = events.slice(0, 50).map((e) => {
		const eventTimeSec = e.event_time
			? Math.floor(e.event_time / 1000)
			: Math.floor(Date.now() / 1000);
		const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;
		const eventTime =
			eventTimeSec >= sevenDaysAgo
				? eventTimeSec
				: Math.floor(Date.now() / 1000);

		const userData: Record<string, string> = {
			external_id: hashedExternalId,
		};
		if (clientIp) userData.client_ip_address = clientIp;
		if (clientUserAgent) userData.client_user_agent = clientUserAgent;

		return {
			event_name: toMetaEventName(e.event_type),
			event_time: eventTime,
			event_id: e.event_id,
			event_source_url: e.page_url || undefined,
			action_source: "website",
			user_data: userData,
		};
	});

	if (data.length === 0) return { sent: 0, skipped: events.length };

	const url = new URL(`${pixelId}/events`, GRAPH_API);
	url.searchParams.set("access_token", accessToken);

	const res = await fetch(url.href, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ data }),
	});

	if (!res.ok) {
		const errBody = await res.text();
		return {
			sent: 0,
			skipped: events.length,
			error: `Meta API ${res.status}: ${errBody}`,
		};
	}

	return {
		sent: data.length,
		skipped: Math.max(0, events.length - data.length),
	};
}
