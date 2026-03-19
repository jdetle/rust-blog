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

/** Standard events for Meta Pixel — use these for ad optimization. */
export const MetaEvents = {
	/** Fire when a user views content (e.g. blog post, product). */
	trackViewContent: (params: {
		content_ids?: string[];
		content_type?: string;
		content_name?: string;
		value?: number;
		currency?: string;
	}) => sendMetaEvent("ViewContent", params),

	/** Fire when a user submits a lead form (newsletter, contact, etc.). */
	trackLead: (params?: { content_name?: string; value?: number }) =>
		sendMetaEvent("Lead", params),

	/** Fire when a user completes registration. */
	trackCompleteRegistration: (params?: { content_name?: string }) =>
		sendMetaEvent("CompleteRegistration", params),

	/** Fire when a user initiates checkout. */
	trackInitiateCheckout: (params?: { value?: number; currency?: string }) =>
		sendMetaEvent("InitiateCheckout", params),

	/** Fire when a user completes a purchase. */
	trackPurchase: (params: {
		value: number;
		currency: string;
		content_ids?: string[];
		content_type?: string;
	}) => sendMetaEvent("Purchase", params),

	/** Fire when a user adds an item to cart. */
	trackAddToCart: (params?: {
		content_ids?: string[];
		content_type?: string;
		value?: number;
		currency?: string;
	}) => sendMetaEvent("AddToCart", params),

	/** Fire when a user performs a search. */
	trackSearch: (params?: { search_string?: string; content_type?: string }) =>
		sendMetaEvent("Search", params),

	/** Fire when a user contacts you. */
	trackContact: (params?: { content_name?: string }) =>
		sendMetaEvent("Contact", params),
} as const;
