/**
 * Syncs aggregated analytics events to Meta Conversions API for ad optimization.
 * Client sends events (from my-events) + identifiers; we forward to Meta.
 *
 * AUTH: Public — user opts in by calling with their own fingerprint/distinct_id
 * and event list; we only send event metadata (type, URL, date) to Meta, no PII.
 */

import { type NextRequest, NextResponse } from "next/server";
import {
	syncEventsToMeta,
	type UnifiedEvent,
} from "@/lib/meta-conversions-api";

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN ?? "";

function getClientIp(req: NextRequest): string | undefined {
	return (
		req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
		req.headers.get("x-real-ip") ??
		req.headers.get("cf-connecting-ip") ??
		undefined
	);
}

export async function POST(request: NextRequest) {
	if (!PIXEL_ID || !ACCESS_TOKEN) {
		return NextResponse.json(
			{ error: "Meta Pixel and access token not configured" },
			{ status: 503 },
		);
	}

	let body: {
		fingerprint?: string;
		distinct_id?: string;
		user_id?: string;
		events?: UnifiedEvent[];
	};
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	const events = body.events ?? [];
	const externalId = body.fingerprint ?? body.distinct_id ?? body.user_id ?? "";

	if (!externalId) {
		return NextResponse.json(
			{ error: "Provide fingerprint, distinct_id, or user_id" },
			{ status: 400 },
		);
	}

	if (events.length === 0) {
		return NextResponse.json({ sent: 0, skipped: 0 });
	}

	const result = await syncEventsToMeta({
		pixelId: PIXEL_ID,
		accessToken: ACCESS_TOKEN,
		events,
		externalId,
		clientIp: getClientIp(request),
		clientUserAgent: request.headers.get("user-agent") ?? undefined,
	});

	if (result.error) {
		console.warn("Meta sync error:", result.error);
		return NextResponse.json(
			{ sent: result.sent, skipped: result.skipped, error: result.error },
			{ status: 502 },
		);
	}

	return NextResponse.json({ sent: result.sent, skipped: result.skipped });
}
