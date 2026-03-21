/**
 * Server-side checks against analytics providers that expose read/list APIs
 * (Clarity Data Export, Plausible Stats API, optional Rust warehouse health).
 * Uses fixed origins + URL() per outbound-url rules.
 */

const PLAUSIBLE_ORIGIN = "https://plausible.io";
const DEFAULT_CLARITY_EXPORT =
	"https://www.clarity.ms/export-data/api/v1/project-live-insights";

export type ClarityExportResult = { ok: true } | { ok: false; reason: string };

/**
 * Microsoft Clarity Data Export API (same path as Rust Aggregator `pull_clarity`).
 */
export async function fetchClarityExportReadable(options: {
	token: string;
	exportUrl?: string;
}): Promise<ClarityExportResult> {
	const { token, exportUrl = DEFAULT_CLARITY_EXPORT } = options;
	if (!token.trim()) {
		return { ok: false, reason: "missing CLARITY_EXPORT_TOKEN" };
	}

	const url = new URL(exportUrl);
	if (url.protocol !== "https:") {
		return { ok: false, reason: "Clarity export URL must use https" };
	}
	url.searchParams.set("numOfDays", "1");

	const res = await fetch(url.href, {
		headers: { Authorization: `Bearer ${token}` },
	});

	if (!res.ok) {
		return {
			ok: false,
			reason: `Clarity export HTTP ${res.status}`,
		};
	}

	try {
		await res.json();
	} catch {
		return { ok: false, reason: "Clarity export response is not JSON" };
	}

	return { ok: true };
}

export type PlausibleStatsResult = { ok: true } | { ok: false; reason: string };

/**
 * Plausible Stats API — aggregate metrics for a site (read-only).
 * @see https://plausible.io/docs/stats-api
 */
export async function fetchPlausibleAggregateReadable(options: {
	apiKey: string;
	siteId: string;
}): Promise<PlausibleStatsResult> {
	const { apiKey, siteId } = options;
	if (!apiKey.trim() || !siteId.trim()) {
		return { ok: false, reason: "missing PLAUSIBLE_API_KEY or site id" };
	}

	const path = "/api/v1/stats/aggregate";
	const url = new URL(path, PLAUSIBLE_ORIGIN);
	url.searchParams.set("site_id", siteId);
	url.searchParams.set("metrics", "visitors");

	const res = await fetch(url.href, {
		headers: { Authorization: `Bearer ${apiKey}` },
	});

	if (!res.ok) {
		return {
			ok: false,
			reason: `Plausible stats HTTP ${res.status}`,
		};
	}

	try {
		const body = (await res.json()) as Record<string, unknown>;
		if (typeof body.results !== "object" || body.results === null) {
			return { ok: false, reason: "Plausible response missing results" };
		}
	} catch {
		return { ok: false, reason: "Plausible response is not JSON" };
	}

	return { ok: true };
}

export type WarehouseHealthResult =
	| { ok: true }
	| { ok: false; reason: string };

/**
 * Rust analytics-ingestion HTTP health (Cosmos-backed service).
 */
export async function fetchAnalyticsWarehouseHealth(
	baseUrl: string,
): Promise<WarehouseHealthResult> {
	if (!baseUrl.trim()) {
		return { ok: false, reason: "missing ANALYTICS_API_URL" };
	}

	let url: URL;
	try {
		url = new URL("/health", baseUrl);
	} catch {
		return { ok: false, reason: "invalid ANALYTICS_API_URL" };
	}

	if (!/^https?:$/i.test(url.protocol)) {
		return { ok: false, reason: "ANALYTICS_API_URL must be http(s)" };
	}

	const res = await fetch(url.href, { method: "GET" });

	if (!res.ok) {
		return {
			ok: false,
			reason: `warehouse health HTTP ${res.status}`,
		};
	}

	const text = await res.text();
	if (!text.includes("ok")) {
		return { ok: false, reason: "warehouse health body unexpected" };
	}

	return { ok: true };
}
