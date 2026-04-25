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
/** Large `avatar_urls` payloads (many base64 PNGs) can take many seconds to transfer; stay within client `USER_PROFILE_FETCH_MS` and above default Vercel 10s cap. */
export const maxDuration = 60;

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
			avatar_urls: [],
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
			// Must exceed small RTT: full portrait history is a multi‑MB JSON body (same order as the browser's own profile call budget; see `USER_PROFILE_FETCH_MS` in `home-fingerprint-avatar.tsx`). A 5s cap routinely aborted before the body finished, yielding empty `avatar_urls` and a single localStorage slide in the hero carousel.
			signal: AbortSignal.timeout(30_000),
		});

		if (!res.ok) {
			return NextResponse.json({
				summary: null,
				updated_at: null,
				persona_guess: null,
				avatar_svg: null,
				avatar_url: null,
				avatar_urls: [],
				avatar_history_len: 0,
			});
		}

		const data = (await res.json()) as {
			summary?: string | null;
			updated_at?: number | null;
			persona_guess?: string | null;
			avatar_svg?: string | null;
			avatar_url?: string | null;
			avatar_urls?: string[] | null;
			avatar_history_len?: number | null;
		};
		const avatarUrls = Array.isArray(data.avatar_urls)
			? data.avatar_urls.filter(
					(u): u is string => typeof u === "string" && u.length > 0,
				)
			: [];
		return NextResponse.json(
			{
				summary: data.summary ?? null,
				updated_at: data.updated_at ?? null,
				persona_guess: data.persona_guess ?? null,
				avatar_svg: data.avatar_svg ?? null,
				avatar_url: data.avatar_url ?? null,
				avatar_urls: avatarUrls,
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
			avatar_urls: [],
			avatar_history_len: 0,
		});
	}
}
