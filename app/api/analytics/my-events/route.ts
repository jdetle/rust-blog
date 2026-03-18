/**
 * Aggregates analytics events from multiple sources (warehouse, PostHog)
 * for the current fingerprinted session. Returns unified event list.
 *
 * AUTH: Public — user requests own events by fingerprint/user_id query params;
 * returns only event metadata (type, URL, date), no PII from DB.
 */

import { type NextRequest, NextResponse } from "next/server";
import { fetchEventsByDistinctId } from "@/lib/posthog-api";

export interface UnifiedEvent {
	event_id: string;
	event_type: string;
	source: string;
	page_url: string;
	event_date: string;
	event_time?: number;
}

const ANALYTICS_API_URL = process.env.NEXT_PUBLIC_ANALYTICS_API_URL ?? "";
const POSTHOG_PERSONAL_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY ?? "";
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID ?? "";

function toEventKey(e: UnifiedEvent): string {
	return `${e.source}:${e.event_type}:${e.page_url}:${e.event_date}`;
}

export async function GET(request: NextRequest) {
	const { searchParams } = request.nextUrl;
	const userId = searchParams.get("user_id") ?? "";
	const fingerprint = searchParams.get("fingerprint") ?? "";
	const limitParam = searchParams.get("limit");
	const limit = Math.min(Number.parseInt(limitParam ?? "50", 10) || 50, 100);

	if (!userId && !fingerprint) {
		return NextResponse.json(
			{ error: "Provide user_id or fingerprint" },
			{ status: 400 },
		);
	}

	const allEvents: UnifiedEvent[] = [];
	const seenKeys = new Set<string>();

	// 1. Warehouse (Rust analytics-ingestion / ScyllaDB)
	if (ANALYTICS_API_URL) {
		try {
			const url = new URL("/user-events", ANALYTICS_API_URL);
			if (userId) url.searchParams.set("user_id", userId);
			if (fingerprint) url.searchParams.set("fingerprint", fingerprint);
			url.searchParams.set("limit", String(limit));

			const res = await fetch(url.href, {
				headers: { Accept: "application/json" },
				next: { revalidate: 30 },
			});

			if (res.ok) {
				const data = (await res.json()) as {
					events?: Array<{
						event_id: string;
						event_type: string;
						source: string;
						page_url: string;
						event_date: string;
						event_time?: number;
					}>;
				};
				for (const e of data.events ?? []) {
					const ev: UnifiedEvent = {
						event_id: e.event_id,
						event_type: e.event_type,
						source: "warehouse",
						page_url: e.page_url ?? "",
						event_date: e.event_date ?? "",
						event_time: e.event_time,
					};
					const key = toEventKey(ev);
					if (!seenKeys.has(key)) {
						seenKeys.add(key);
						allEvents.push(ev);
					}
				}
			}
		} catch (err) {
			console.warn("Warehouse fetch failed:", err);
		}
	}

	// 2. PostHog (by distinct_id)
	if (userId && POSTHOG_PERSONAL_API_KEY && POSTHOG_PROJECT_ID) {
		try {
			const posthogEvents = await fetchEventsByDistinctId(userId, {
				personalApiKey: POSTHOG_PERSONAL_API_KEY,
				projectId: POSTHOG_PROJECT_ID,
				limit,
			});

			for (const e of posthogEvents) {
				const date =
					e.timestamp?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
				const rawUrl = (e.properties as Record<string, unknown>)?.$current_url;
				const pageUrl = typeof rawUrl === "string" ? rawUrl : "";
				const ev: UnifiedEvent = {
					event_id: e.id ?? `ph-${e.timestamp}-${e.event}`,
					event_type: e.event ?? "unknown",
					source: "posthog",
					page_url: pageUrl,
					event_date: date,
					event_time: e.timestamp ? new Date(e.timestamp).getTime() : undefined,
				};
				const key = toEventKey(ev);
				if (!seenKeys.has(key)) {
					seenKeys.add(key);
					allEvents.push(ev);
				}
			}
		} catch (err) {
			console.warn("PostHog fetch failed:", err);
		}
	}

	// Sort by event_time desc (most recent first)
	allEvents.sort((a, b) => {
		const tA = a.event_time ?? 0;
		const tB = b.event_time ?? 0;
		return tB - tA;
	});
	const truncated = allEvents.slice(0, limit);

	return NextResponse.json({ events: truncated });
}
