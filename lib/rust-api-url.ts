/**
 * Base URL for the `/api/rust/*` proxy routes.
 *
 * These routes previously forwarded to the standalone `rust-api` Container App.
 * After consolidation they still resolve through `RUST_API_URL`, but `BLOG_SERVICE_URL`
 * is preferred when set so the same Container App handles both paths.
 *
 * Resolution order (first non-empty wins):
 *   1. `BLOG_SERVICE_URL` — canonical name for the unified service
 *   2. `RUST_API_URL`     — legacy name
 */

const RUST_PATH_SEGMENT = /^[a-zA-Z0-9_.-]+$/;

export function getRustApiBaseUrl(): string {
	const candidates = [
		process.env.BLOG_SERVICE_URL,
		process.env.RUST_API_URL,
	];
	for (const raw of candidates) {
		const trimmed = raw?.trim();
		if (trimmed) return stripTrailingSlash(trimmed);
	}
	return "";
}

/**
 * Builds a path under the service for proxying. Rejects traversal or odd segments.
 */
export function rustProxyPathFromSegments(segments: string[]): string | null {
	for (const s of segments) {
		if (s === "." || s === "..") return null;
		if (!RUST_PATH_SEGMENT.test(s)) return null;
	}
	if (segments.length === 0) return "/";
	return `/${segments.join("/")}`;
}

/**
 * Resolves `path` against the service base URL and verifies the origin matches (SSRF guard).
 */
export function rustApiUrlForProxyPath(path: string): URL | null {
	const base = getRustApiBaseUrl();
	if (!base) return null;
	let baseUrl: URL;
	try {
		baseUrl = new URL(base);
	} catch {
		return null;
	}
	const url = new URL(path, baseUrl);
	if (url.origin !== baseUrl.origin) return null;
	return url;
}

function stripTrailingSlash(url: string): string {
	return url.replace(/\/$/, "");
}
