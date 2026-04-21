/**
 * Resolve the visitor's IP for geolocation when requests pass through proxies
 * (Cloudflare, load balancers). The leftmost X-Forwarded-For hop is not always
 * the end user — use provider-specific headers first.
 *
 * @see https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-connecting-ip
 */

export function getClientIpFromHeaders(headers: Headers): string | null {
	const cf = headers.get("cf-connecting-ip")?.trim();
	if (cf) return cf;

	const trueClient = headers.get("true-client-ip")?.trim();
	if (trueClient) return trueClient;

	const xReal = headers.get("x-real-ip")?.trim();
	if (xReal) return xReal;

	const xff = headers.get("x-forwarded-for");
	const first = xff?.split(",")[0]?.trim();
	if (first) return first;

	return null;
}

/** True when Cloudflare is in front (visitor IP is in CF-Connecting-IP). */
export function isBehindCloudflare(headers: Headers): boolean {
	return Boolean(headers.get("cf-ray") || headers.get("cf-connecting-ip"));
}
