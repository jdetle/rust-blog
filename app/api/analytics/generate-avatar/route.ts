/**
 * Proxies to Rust analytics service: generates 4 × 1024×1024 regional-artist collage
 * PNGs per visitor per calendar day (UTC) via OpenAI gpt-image-1, persisted in Cosmos DB.
 *
 * AUTH: Gated by Cloudflare Turnstile token verification before proxying upstream.
 *       The token is verified server-side and is NOT forwarded to the Rust service.
 */

import { type NextRequest, NextResponse } from "next/server";
import { getAnalyticsIngestionBaseUrl } from "@/lib/analytics-ingestion-url";
import { verifyTurnstileToken } from "@/lib/turnstile";

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
		session_id?: string;
		turnstile_token?: string;
		user_context?: Record<string, unknown>;
	};
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	// ── Turnstile verification ────────────────────────────────────────
	const turnstileToken = body.turnstile_token;
	if (!turnstileToken) {
		return NextResponse.json(
			{ error: "Turnstile token required" },
			{ status: 400 },
		);
	}

	const remoteIp =
		request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? undefined;

	const captcha = await verifyTurnstileToken(turnstileToken, remoteIp);
	if (!captcha.ok) {
		return NextResponse.json(
			{
				error: "Captcha verification failed",
				error_codes: captcha.error_codes,
			},
			{ status: 403 },
		);
	}

	// ── Validate payload ─────────────────────────────────────────────
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
				session_id: body.session_id ?? "",
				user_context: body.user_context ?? {},
			}),
			// 4 parallel gpt-image-1 calls; p95 per call ≈ 20–30 s, all run in parallel.
			// Give 55 s total to accommodate variance across all four slots.
			signal: AbortSignal.timeout(55_000),
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
