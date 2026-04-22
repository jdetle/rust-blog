/** Shape compatible with `/api/analytics/my-events` items. */

export interface UnifiedEventLite {
	event_type: string;
	source: string;
	page_url: string;
}

const DEFAULT_MAX_CHARS = 1500;

function pathFromUrl(url: string): string {
	if (!url) return "";
	try {
		const path = new URL(url).pathname;
		return path === "/" ? "/" : path;
	} catch {
		return url.slice(0, 120);
	}
}

/**
 * Compact factual block for avatar / observation prompts: totals, counts by analytics
 * source (warehouse, PostHog, etc.), top event names and paths.
 */
export function formatUnifiedEngagementLog(
	events: UnifiedEventLite[],
	options?: { maxChars?: number },
): string | undefined {
	if (!events.length) return undefined;

	const maxChars = options?.maxChars ?? DEFAULT_MAX_CHARS;

	const bySource = new Map<string, number>();
	const byEventType = new Map<string, number>();
	const byPath = new Map<string, number>();

	for (const e of events) {
		const src = e.source || "unknown";
		bySource.set(src, (bySource.get(src) ?? 0) + 1);
		const et = e.event_type || "unknown";
		byEventType.set(et, (byEventType.get(et) ?? 0) + 1);
		const path = pathFromUrl(e.page_url);
		if (path) byPath.set(path, (byPath.get(path) ?? 0) + 1);
	}

	const lines: string[] = [];
	lines.push(`Recorded events in merged sample: ${events.length}`);

	const sourcesSorted = [...bySource.entries()].sort((a, b) => b[1] - a[1]);
	lines.push(
		`By source: ${sourcesSorted.map(([k, v]) => `${k} (${v})`).join(", ")}`,
	);

	const topTypes = [...byEventType.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 7);
	if (topTypes.length)
		lines.push(
			`Top event types: ${topTypes.map(([k, v]) => `${k}×${v}`).join(", ")}`,
		);

	const topPaths = [...byPath.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 6);
	if (topPaths.length)
		lines.push(
			`Top paths: ${topPaths.map(([k, v]) => `${k} (${v})`).join(", ")}`,
		);

	let out = lines.join("\n");
	if (out.length > maxChars) {
		out = `${out.slice(0, maxChars - 3)}...`;
	}
	return out;
}
