import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/** Max cookie value length — stay under browser 4KB limit */
const MAX_COOKIE_LENGTH = 2000;

function withForwardedFor(request: NextRequest): Headers {
	const headers = new Headers(request.headers);
	const existing = headers.get("x-forwarded-for");
	if (!existing?.trim()) {
		const reqIp = (request as unknown as { ip?: string })?.ip;
		if (typeof reqIp === "string" && reqIp.trim().length > 0) {
			headers.set("x-forwarded-for", reqIp.trim());
		} else if (process.env.NODE_ENV === "development") {
			headers.set("x-forwarded-for", "127.0.0.1");
		}
	}
	return headers;
}

export function middleware(request: NextRequest) {
	try {
		const url = request.nextUrl;
		const response = NextResponse.next({
			request: { headers: withForwardedFor(request) },
		});

		// ── UTM capture ────────────────────────────────────────────────────
		const utmKeys = [
			"utm_source",
			"utm_medium",
			"utm_campaign",
			"utm_term",
			"utm_content",
		];
		const utm: Record<string, string> = {};
		for (const key of utmKeys) {
			const val = url.searchParams.get(key);
			if (val) utm[key] = val;
		}
		if (Object.keys(utm).length > 0) {
			const utmStr = JSON.stringify(utm);
			if (utmStr.length <= MAX_COOKIE_LENGTH) {
				response.cookies.set("_utm", utmStr, {
					httpOnly: false,
					maxAge: 60 * 30,
					path: "/",
					sameSite: "lax",
				});
			}
		}

		// ── Referrer capture ───────────────────────────────────────────────
		const referer = request.headers.get("referer");
		if (
			referer &&
			!request.cookies.get("_referrer") &&
			referer.length <= MAX_COOKIE_LENGTH
		) {
			try {
				const refHost = new URL(referer).hostname;
				const selfHost = url.hostname;
				if (refHost && selfHost && refHost !== selfHost) {
					response.cookies.set("_referrer", referer, {
						httpOnly: false,
						maxAge: 60 * 30,
						path: "/",
						sameSite: "lax",
					});
				}
			} catch {
				/* malformed referer */
			}
		}

		// ── Edge intelligence headers ──────────────────────────────────────
		const cfRay = request.headers.get("cf-ray");
		if (cfRay) {
			response.headers.set("x-edge-pop", cfRay);
		}
		response.headers.set("x-edge-timestamp", Date.now().toString());

		return response;
	} catch {
		return NextResponse.next({
			request: { headers: withForwardedFor(request) },
		});
	}
}

export const config = {
	matcher: ["/((?!_next/static|_next/image|favicon.ico|blog.css).*)"],
};
