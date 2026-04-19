/**
 * Cloudflare Turnstile server-side verification endpoint.
 *
 * POST { token: string } → { ok, hostname, challenge_ts, error_codes }
 *
 * Used for standalone debugging. The primary verification path lives in
 * /api/analytics/generate-avatar (token cannot be replayed across endpoints).
 */

import { type NextRequest, NextResponse } from "next/server";
import { verifyTurnstileToken } from "@/lib/turnstile";

export async function POST(request: NextRequest) {
	let body: { token?: string };
	try {
		body = (await request.json()) as { token?: string };
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	if (!body.token) {
		return NextResponse.json({ error: "Provide token" }, { status: 400 });
	}

	const remoteIp =
		request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? undefined;

	const result = await verifyTurnstileToken(body.token, remoteIp);
	return NextResponse.json(result, { status: result.ok ? 200 : 403 });
}
