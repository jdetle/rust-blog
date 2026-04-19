/**
 * Cloudflare Turnstile server-side verification helper.
 *
 * POST { token: string } → { ok, hostname, challenge_ts, error_codes }
 *
 * This route is used for standalone debugging. The primary verification path is
 * inlined inside /api/analytics/generate-avatar so the token cannot be replayed
 * across endpoints.
 */

import { type NextRequest, NextResponse } from "next/server";

const TURNSTILE_VERIFY_URL =
	"https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileVerifyResult {
	ok: boolean;
	hostname?: string;
	challenge_ts?: string;
	error_codes?: string[];
}

/** Verify a Turnstile token against the Cloudflare siteverify API. */
export async function verifyTurnstileToken(
	token: string,
	remoteIp?: string,
): Promise<TurnstileVerifyResult> {
	const secret = process.env.TURNSTILE_SECRET_KEY ?? "";
	if (!secret) {
		// No secret configured — skip verification in development.
		return { ok: true };
	}

	const form = new URLSearchParams({ secret, response: token });
	if (remoteIp) form.set("remoteip", remoteIp);

	const res = await fetch(TURNSTILE_VERIFY_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: form.toString(),
	});

	const json = (await res.json()) as {
		success: boolean;
		hostname?: string;
		challenge_ts?: string;
		"error-codes"?: string[];
	};

	return {
		ok: json.success,
		hostname: json.hostname,
		challenge_ts: json.challenge_ts,
		error_codes: json["error-codes"],
	};
}

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
