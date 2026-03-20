/**
 * Aggregate Resource Timing entries by third-party hostname (lower-bound;
 * cross-origin entries may omit timing fields but name is usually present).
 */

export type ThirdPartyHostAgg = {
	host: string;
	count: number;
	initiatorTypes: string[];
};

function pageHostname(pageOrigin: string): string | null {
	try {
		return new URL(pageOrigin).hostname;
	} catch {
		return null;
	}
}

/** Resolve hostname from PerformanceResourceTiming.name (absolute URL). */
export function hostnameFromResourceName(name: string): string | null {
	if (!name) return null;
	try {
		const u = new URL(name);
		const h = u.hostname;
		return h || null;
	} catch {
		return null;
	}
}

/**
 * Group non-first-party resource requests by host.
 * Same-origin requests (matching page origin hostname) are excluded.
 */
export function aggregateThirdPartyResources(
	pageOrigin: string,
	entries: Pick<PerformanceResourceTiming, "name" | "initiatorType">[],
): ThirdPartyHostAgg[] {
	const firstHost = pageHostname(pageOrigin);
	if (!firstHost) return [];

	const map = new Map<string, { count: number; types: Set<string> }>();

	for (const e of entries) {
		const host = hostnameFromResourceName(e.name);
		if (!host) continue;
		if (host === firstHost) continue;

		const bucket = map.get(host) ?? { count: 0, types: new Set<string>() };
		bucket.count += 1;
		bucket.types.add(e.initiatorType || "unknown");
		map.set(host, bucket);
	}

	return [...map.entries()]
		.map(([host, v]) => ({
			host,
			count: v.count,
			initiatorTypes: [...v.types].sort(),
		}))
		.sort((a, b) => b.count - a.count);
}

export type ExposureInputs = {
	activeTrackerCount: number;
	thirdPartyHostCount: number;
	storedEventCount: number;
	vpnVerdict: string;
	vpnConfidence: number;
};

/**
 * Heuristic 0–100 "commercial tracking surface" score (not scientific).
 */
export function computeExposureScore(input: ExposureInputs): number {
	let s = 0;
	s += Math.min(28, input.activeTrackerCount * 7);
	s += Math.min(32, input.thirdPartyHostCount * 3);
	s += Math.min(22, Math.floor(input.storedEventCount / 3));
	if (input.vpnVerdict !== "residential" && input.vpnVerdict !== "unknown") {
		s += Math.min(18, Math.round(input.vpnConfidence * 0.18));
	}
	return Math.min(100, Math.round(s));
}
