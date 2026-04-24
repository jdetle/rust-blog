import * as Sentry from "@sentry/nextjs";

export const dynamic = "force-dynamic";

function exampleRoutesDisabled(): boolean {
	return (
		process.env.NODE_ENV === "production" &&
		process.env.SENTRY_ENABLE_EXAMPLE_ROUTES !== "true"
	);
}

class SentryExampleAPIError extends Error {
	constructor(message: string | undefined) {
		super(message);
		this.name = "SentryExampleAPIError";
	}
}

export function GET() {
	if (exampleRoutesDisabled()) {
		return new Response(null, { status: 404 });
	}
	Sentry.logger.info("Sentry example API called");
	throw new SentryExampleAPIError(
		"This error is raised on the backend called by the example page.",
	);
}
