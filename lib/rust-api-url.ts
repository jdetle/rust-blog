/**
 * Base URL for the `rust-api` Azure Container App (see `rust-api/README.md`).
 * Server-only — Next.js API routes under `/api/rust/*` proxy here.
 */

const RUST_PATH_SEGMENT = /^[a-zA-Z0-9_.-]+$/;

export function getRustApiBaseUrl(): string {
	const raw = process.env.RUST_API_URL?.trim();
	if (!raw) return "";
	return stripTrailingSlash(raw);
}

/**
 * Builds a path under `rust-api` for proxying. Rejects traversal or odd segments.
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
 * Resolves `path` against `RUST_API_URL` and verifies the origin matches (SSRF guard).
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
