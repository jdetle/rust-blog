/**
 * Meta Pixel event helpers. Use after successful actions (newsletter signup, purchase, etc.).
 * Requires NEXT_PUBLIC_META_PIXEL_ID to be set.
 */
export function sendMetaEvent(
	eventName: string,
	params?: Record<string, unknown>,
): void {
	if (typeof window === "undefined") return;
	const fbq = (window as { fbq?: (...args: unknown[]) => void }).fbq;
	if (!fbq) return;
	if (params) {
		fbq("track", eventName, params);
	} else {
		fbq("track", eventName);
	}
}
