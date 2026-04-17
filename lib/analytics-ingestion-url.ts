/**
 * Base URL for the blog-service (formerly analytics-ingestion). Next.js API routes proxy here.
 *
 * Resolution order (first non-empty wins):
 *   1. `BLOG_SERVICE_URL`              — new canonical name for the unified service
 *   2. `ANALYTICS_API_URL`            — legacy server-only name (still set in Vercel prod)
 *   3. `NEXT_PUBLIC_ANALYTICS_API_URL` — older client-exposed name, kept for backward compat
 *
 * Both legacy names continue to work so Vercel production is not broken before the
 * env var is updated to `BLOG_SERVICE_URL`.
 */

export function getAnalyticsIngestionBaseUrl(): string {
	const candidates = [
		process.env.BLOG_SERVICE_URL,
		process.env.ANALYTICS_API_URL,
		process.env.NEXT_PUBLIC_ANALYTICS_API_URL,
	];
	for (const raw of candidates) {
		const trimmed = raw?.trim();
		if (trimmed) return stripTrailingSlash(trimmed);
	}
	return "";
}

function stripTrailingSlash(url: string): string {
	return url.replace(/\/$/, "");
}
