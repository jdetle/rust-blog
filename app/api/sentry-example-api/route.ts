export const dynamic = "force-dynamic";

function exampleRoutesDisabled(): boolean {
	return (
		process.env.NODE_ENV === "production" &&
		process.env.SENTRY_ENABLE_EXAMPLE_ROUTES !== "true"
	);
}

export function GET() {
	if (exampleRoutesDisabled()) {
		return new Response(null, { status: 404 });
	}
	throw new Error("Sentry Example API error");
}
