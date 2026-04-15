/**
 * Base URL for the Rust analytics ingestion service (Next.js API routes proxy here).
 *
 * Prefer `ANALYTICS_API_URL` (server-only, not exposed to the browser bundle).
 * `NEXT_PUBLIC_ANALYTICS_API_URL` is supported for backward compatibility.
 */

export function getAnalyticsIngestionBaseUrl(): string {
	const primary = process.env.ANALYTICS_API_URL?.trim();
	if (primary) return stripTrailingSlash(primary);
	const legacy = process.env.NEXT_PUBLIC_ANALYTICS_API_URL?.trim();
	if (legacy) return stripTrailingSlash(legacy);
	return "";
}

function stripTrailingSlash(url: string): string {
	return url.replace(/\/$/, "");
}
