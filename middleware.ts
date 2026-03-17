import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const url = request.nextUrl;

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
    response.cookies.set("_utm", JSON.stringify(utm), {
      httpOnly: false,
      maxAge: 60 * 30,
      path: "/",
      sameSite: "lax",
    });
  }

  // ── Referrer capture ───────────────────────────────────────────────
  const referer = request.headers.get("referer");
  if (referer && !request.cookies.get("_referrer")) {
    try {
      const refHost = new URL(referer).hostname;
      const selfHost = url.hostname;
      if (refHost !== selfHost) {
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
  // Stamp the edge POP identifier and processing timestamp so
  // downstream pages know which edge node served the request.
  const vercelId = request.headers.get("x-vercel-id");
  if (vercelId) {
    const pop = vercelId.split("::")[0];
    response.headers.set("x-edge-pop", pop);
  }
  response.headers.set("x-edge-timestamp", Date.now().toString());

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|blog.css).*)"],
};
