import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (typeof dsn === "string" && dsn.length > 0) {
	Sentry.init({
		dsn,
		tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
	});
}
