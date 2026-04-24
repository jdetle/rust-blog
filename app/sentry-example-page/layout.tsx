import { notFound } from "next/navigation";

/**
 * Sentry smoke-test UI — disabled in production unless SENTRY_ENABLE_EXAMPLE_ROUTES=true.
 */
export default function SentryExampleLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	if (
		process.env.NODE_ENV === "production" &&
		process.env.SENTRY_ENABLE_EXAMPLE_ROUTES !== "true"
	) {
		notFound();
	}
	return children;
}
