/**
 * Proxies to the Rust analytics aggregator's user-profile endpoint.
 * Returns the LLM-generated summary for the given fingerprint/distinct_id.
 *
 * AUTH: Public — user requests own profile by fingerprint or distinct_id.
 */

import { type NextRequest, NextResponse } from "next/server";

const ANALYTICS_API_URL = process.env.NEXT_PUBLIC_ANALYTICS_API_URL ?? "";

export async function GET(request: NextRequest) {
	const { searchParams } = request.nextUrl;
	const fingerprint = searchParams.get("fingerprint") ?? "";
	const userId = searchParams.get("user_id") ?? "";
	const distinctId = searchParams.get("distinct_id") ?? "";

	const lookupId = fingerprint || userId || distinctId;
	if (!lookupId) {
		return NextResponse.json(
			{ error: "Provide fingerprint, user_id, or distinct_id" },
			{ status: 400 },
		);
	}

	if (!ANALYTICS_API_URL) {
		return NextResponse.json({ summary: null, updated_at: null });
	}

	try {
		const url = new URL("/user-profile", ANALYTICS_API_URL);
		url.searchParams.set("fingerprint", fingerprint);
		url.searchParams.set("user_id", userId);
		url.searchParams.set("distinct_id", distinctId);

		const res = await fetch(url.href, {
			headers: { Accept: "application/json" },
			next: { revalidate: 60 },
		});

		if (!res.ok) {
			return NextResponse.json({ summary: null, updated_at: null });
		}

		const data = (await res.json()) as {
			summary?: string | null;
			updated_at?: number | null;
		};
		return NextResponse.json({
			summary: data.summary ?? null,
			updated_at: data.updated_at ?? null,
		});
	} catch (err) {
		console.warn("User profile fetch failed:", err);
		return NextResponse.json({ summary: null, updated_at: null });
	}
}
