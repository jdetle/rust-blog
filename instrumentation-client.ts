import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";

const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (typeof sentryDsn === "string" && sentryDsn.length > 0) {
	Sentry.init({
		dsn: sentryDsn,
		// Intentional: improves replay/error correlation; differs from Rust SENTRY_SEND_DEFAULT_PII default in .env.example.
		sendDefaultPii: true,
		tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
		integrations: [Sentry.replayIntegration()],
		replaysSessionSampleRate: 0.1,
		replaysOnErrorSampleRate: 1.0,
	});
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
if (typeof posthogKey === "string" && posthogKey.length > 0) {
	posthog.init(posthogKey, {
		api_host: "/ingest",
		ui_host: "https://us.posthog.com",
		defaults: "2026-01-30",
		capture_exceptions: true,
		debug: process.env.NODE_ENV === "development",
	});
	if (typeof window !== "undefined") {
		(window as Window & { posthog?: typeof posthog }).posthog = posthog;
	}
}
