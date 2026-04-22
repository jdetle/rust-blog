/**
 * Normalizes avatar payloads from `/api/analytics/user-profile` and
 * `/api/analytics/generate-avatar` into PNG data URIs for the home carousel.
 *
 * Important: return **every** URL the API sends in `avatar_urls`. Do not cap
 * this list using `my-events` or other analytics samples — those are sparse
 * and will under-count calendar days, hiding stored portraits.
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
