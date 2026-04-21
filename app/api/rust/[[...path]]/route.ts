/**
 * Server-side proxy to the blog-service Container App (health, ready, /v1/info, etc.).
 * Set `BLOG_SERVICE_URL` or `RUST_API_URL` to the app FQDN (e.g. Azure).
 *
 * Example: GET /api/rust/health → GET ${BLOG_SERVICE_URL}/health
 */

import { type NextRequest, NextResponse } from "next/server";
import {
	rustApiUrlForProxyPath,
	rustProxyPathFromSegments,
} from "@/lib/rust-api-url";

type RouteContext = { params: Promise<{ path?: string[] }> };

export async function GET(request: NextRequest, context: RouteContext) {
	const { path: segments = [] } = await context.params;
	const rel = rustProxyPathFromSegments(segments);
	if (rel === null) {
		return NextResponse.json({ error: "Invalid path" }, { status: 400 });
	}
	const url = rustApiUrlForProxyPath(rel);
	if (!url) {
		return NextResponse.json(
			{ error: "RUST_API_URL is not configured" },
			{ status: 503 },
		);
	}

	const search = request.nextUrl.search;
	if (search) {
		url.search = search;
	}

	const res = await fetch(url.href, {
		method: "GET",
		headers: {
			Accept: request.headers.get("Accept") ?? "application/json",
		},
		next: { revalidate: 0 },
	});

	const body = await res.arrayBuffer();
	const headers = new Headers(res.headers);
	headers.delete("content-encoding");
	headers.delete("transfer-encoding");

	return new NextResponse(body, { status: res.status, headers });
}
