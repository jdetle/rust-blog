/**
 * Safe display helpers for analytics URLs that may be percent-encoded
 * (sometimes double-encoded) in warehouse or vendor payloads.
 */

const MAX_DECODE_PASSES = 3;

export function safeDecodeUriComponent(s: string): string {
	if (!s) return "";
	let out = s;
	for (let i = 0; i < MAX_DECODE_PASSES; i++) {
		try {
			const next = decodeURIComponent(out);
			if (next === out) break;
			out = next;
		} catch {
			break;
		}
	}
	return out;
}

/**
 * Short label for a page URL: same-origin → `pathname + search`; otherwise
 * `hostname + pathname + search`. Falls back to decoded string if parsing fails.
 */
export function formatPageLabel(
	rawUrl: string,
	siteOrigin?: string | null,
): string {
	const decoded = safeDecodeUriComponent(rawUrl.trim());
	if (!decoded) return "";

	let url: URL;
	try {
		if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
			url = new URL(decoded);
		} else if (decoded.startsWith("/")) {
			const base = siteOrigin ?? "https://placeholder.local";
			url = new URL(decoded, base);
		} else {
			url = new URL(`https://${decoded}`);
		}
	} catch {
		return decoded;
	}

	const pathAndSearch = `${url.pathname}${url.search}` || "/";

	if (siteOrigin) {
		try {
			const site = new URL(siteOrigin);
			if (url.origin === site.origin) return pathAndSearch;
		} catch {
			/* fall through */
		}
	}

	if (typeof window !== "undefined") {
		try {
			if (url.origin === window.location.origin) return pathAndSearch;
		} catch {
			/* fall through */
		}
	}

	const host = url.hostname;
	return host ? `${host}${pathAndSearch}` : pathAndSearch;
}

/**
 * Build a clickable href for analytics URLs (absolute http(s), or site-relative).
 */
export function absoluteEventUrl(
	rawUrl: string,
	siteOrigin?: string | null,
): string {
	const decoded = safeDecodeUriComponent(rawUrl.trim());
	if (!decoded) return "";
	if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
		return decoded;
	}
	if (decoded.startsWith("/")) {
		const base =
			siteOrigin ??
			(typeof window !== "undefined" ? window.location.origin : "");
		if (base) return `${base.replace(/\/$/, "")}${decoded}`;
	}
	return decoded;
}
