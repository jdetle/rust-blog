/**
 * Cloudflare Turnstile server-side token verification helper.
 * Shared between /api/captcha/verify and /api/analytics/generate-avatar.
 */

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
	const secret = (process.env.TURNSTILE_SECRET_KEY ?? "").trim();
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
