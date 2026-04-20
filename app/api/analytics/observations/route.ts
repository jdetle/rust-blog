/**
 * POST /api/analytics/observations
 *
 * Calls the Rust service to generate 6 factual, one-sentence observations about the
 * visitor's analytics signals using Claude Haiku. No Turnstile gate — this endpoint
 * is low-cost and runs concurrently with the heavier generate-avatar call, giving
 * the user something to read during the ~40s image-generation wait.
 *
 * Returns: { observations: string[] }
 */

import { type NextRequest, NextResponse } from "next/server";
import { getAnalyticsIngestionBaseUrl } from "@/lib/analytics-ingestion-url";

export async function POST(request: NextRequest) {
	const ANALYTICS_API_URL = getAnalyticsIngestionBaseUrl();
	if (!ANALYTICS_API_URL) {
		return NextResponse.json(
			{ error: "Analytics service not configured" },
			{ status: 503 },
		);
	}

	let body: {
		fingerprint?: string;
		user_id?: string;
		distinct_id?: string;
		user_context?: Record<string, unknown>;
	};
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	try {
		const url = new URL("/user-profile/observations", ANALYTICS_API_URL);
		const res = await fetch(url.href, {
			method: "POST",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				fingerprint: body.fingerprint ?? "",
				user_id: body.user_id ?? "",
				distinct_id: body.distinct_id ?? "",
				user_context: body.user_context ?? {},
			}),
			// Claude Haiku is fast; 15 s is generous.
			signal: AbortSignal.timeout(15_000),
		});

		const data = (await res.json()) as Record<string, unknown>;
		return NextResponse.json(data, { status: res.status });
	} catch (err) {
		console.warn("observations proxy failed:", err);
		// Fail gracefully — no observations is better than a broken page.
		return NextResponse.json({ observations: [] }, { status: 200 });
	}
}
