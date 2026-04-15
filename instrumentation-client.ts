import posthog from "posthog-js";

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
if (typeof posthogKey === "string" && posthogKey.length > 0) {
	posthog.init(posthogKey, {
		api_host: "/ingest",
		ui_host: "https://us.posthog.com",
		defaults: "2026-01-30",
		capture_exceptions: true,
		debug: process.env.NODE_ENV === "development",
	});
	// Expose for DevTools and legacy checks; primary API is the module singleton.
	if (typeof window !== "undefined") {
		(window as Window & { posthog?: typeof posthog }).posthog = posthog;
	}
}
