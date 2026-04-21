/**
 * Proxies to the Rust analytics aggregator's user-profile endpoint.
 * Returns the LLM-generated summary, persona guess, and avatar for the given fingerprint/distinct_id.
 *
 * AUTH: Public — user requests own profile by fingerprint or distinct_id.
 *
 * Must not be cached: personalized responses would serve stale "no avatar" after generation.
 */

import { type NextRequest, NextResponse } from "next/server";
import { getAnalyticsIngestionBaseUrl } from "@/lib/analytics-ingestion-url";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
	const ANALYTICS_API_URL = getAnalyticsIngestionBaseUrl();
	const { searchParams } = request.nextUrl;
	const fingerprint = searchParams.get("fingerprint") ?? "";
	const userId = searchParams.get("user_id") ?? "";
	const distinctId = searchParams.get("distinct_id") ?? "";
	const sessionId = searchParams.get("session_id") ?? "";

	const lookupId = fingerprint || userId || distinctId;
	if (!lookupId) {
		return NextResponse.json(
			{ error: "Provide fingerprint, user_id, or distinct_id" },
			{ status: 400 },
		);
	}

	if (!ANALYTICS_API_URL) {
		return NextResponse.json({
			summary: null,
			updated_at: null,
			persona_guess: null,
			avatar_svg: null,
			avatar_url: null,
			avatar_history_len: 0,
		});
	}

	try {
		const url = new URL("/user-profile", ANALYTICS_API_URL);
		url.searchParams.set("fingerprint", fingerprint);
		url.searchParams.set("user_id", userId);
		url.searchParams.set("distinct_id", distinctId);
		if (sessionId) url.searchParams.set("session_id", sessionId);

		const res = await fetch(url.href, {
			headers: { Accept: "application/json" },
			cache: "no-store",
			signal: AbortSignal.timeout(5_000),
		});

		if (!res.ok) {
			return NextResponse.json({
				summary: null,
				updated_at: null,
				persona_guess: null,
				avatar_svg: null,
				avatar_url: null,
				avatar_history_len: 0,
			});
		}

		const data = (await res.json()) as {
			summary?: string | null;
			updated_at?: number | null;
			persona_guess?: string | null;
			avatar_svg?: string | null;
			avatar_url?: string | null;
			avatar_history_len?: number | null;
		};
		return NextResponse.json(
			{
				summary: data.summary ?? null,
				updated_at: data.updated_at ?? null,
				persona_guess: data.persona_guess ?? null,
				avatar_svg: data.avatar_svg ?? null,
				avatar_url: data.avatar_url ?? null,
				avatar_history_len: data.avatar_history_len ?? 0,
			},
			{
				headers: {
					"Cache-Control":
						"private, no-store, no-cache, must-revalidate, max-age=0",
				},
			},
		);
	} catch (err) {
		console.warn("User profile fetch failed:", err);
		return NextResponse.json({
			summary: null,
			updated_at: null,
			persona_guess: null,
			avatar_svg: null,
			avatar_url: null,
			avatar_history_len: 0,
		});
	}
}
