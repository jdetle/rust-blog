/**
 * Proxies to Rust analytics service: generates a fictional SVG avatar + persona line
 * via Anthropic Messages API and persists them in Cosmos (user_profiles).
 *
 * AUTH: Public — caller supplies their own fingerprint / distinct_id (same model as user-profile).
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
	};
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const fingerprint = body.fingerprint ?? "";
	const userId = body.user_id ?? "";
	const distinctId = body.distinct_id ?? "";
	if (!fingerprint && !userId && !distinctId) {
		return NextResponse.json(
			{ error: "Provide fingerprint, user_id, or distinct_id" },
			{ status: 400 },
		);
	}

	try {
		const url = new URL("/user-profile/generate-avatar", ANALYTICS_API_URL);
		const res = await fetch(url.href, {
			method: "POST",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				fingerprint,
				user_id: userId,
				distinct_id: distinctId,
			}),
			signal: AbortSignal.timeout(25_000),
		});

		const data = (await res.json()) as Record<string, unknown>;
		return NextResponse.json(data, { status: res.status });
	} catch (err) {
		console.warn("generate-avatar proxy failed:", err);
		return NextResponse.json(
			{ error: "Avatar generation unavailable" },
			{ status: 502 },
		);
	}
}
