/**
 * Normalizes avatar payloads from `/api/analytics/user-profile` and
 * `/api/analytics/generate-avatar` into PNG data URIs for portrait carousels.
 *
 * **Always prefer `avatar_urls`** (full history). Use `avatar_url` only as a
 * fallback when the array is missing or empty so older clients still see one slide.
 *
 * **Storage contract (Rust `UserProfile::appended_png_history`):** each new
 * successful generation **appends** to `avatar_pngs` (deduped if the same PNG
 * is written twice); the list is only trimmed at `MAX_AVATAR_PNG_HISTORY`.
 * Do not cap this list using `my-events` or other analytics samples — those are
 * sparse and will under-count calendar days, hiding stored portraits.
 */

const PNG_DATA_URI_PREFIX = "data:image/png;base64,";

export function isAvatarPngDataUri(s: string): boolean {
	return s.startsWith(PNG_DATA_URI_PREFIX);
}

export function portraitDataUrisFromAvatarPayload(data: {
	avatar_urls?: unknown;
	avatar_url?: unknown;
}): string[] {
	if (Array.isArray(data.avatar_urls) && data.avatar_urls.length > 0) {
		return data.avatar_urls.filter(
			(u): u is string => typeof u === "string" && isAvatarPngDataUri(u),
		);
	}
	if (
		typeof data.avatar_url === "string" &&
		isAvatarPngDataUri(data.avatar_url)
	) {
		return [data.avatar_url];
	}
	return [];
}

/**
 * Server list is newest-first and authoritative for order; any local-only URIs
 * (e.g. from localStorage while profile is still loading) are appended after, deduped.
 */
export function mergePortraitUrisNewestFirst(
	serverNewestFirst: string[],
	localNewestFirst: string[],
): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	for (const u of serverNewestFirst) {
		if (isAvatarPngDataUri(u) && !seen.has(u)) {
			seen.add(u);
			out.push(u);
		}
	}
	for (const u of localNewestFirst) {
		if (isAvatarPngDataUri(u) && !seen.has(u)) {
			seen.add(u);
			out.push(u);
		}
	}
	return out;
}
