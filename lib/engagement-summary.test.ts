import { describe, expect, test } from "vitest";
import { formatUnifiedEngagementLog } from "@/lib/engagement-summary";

describe("formatUnifiedEngagementLog", () => {
	test("returns summary with sources and counts", () => {
		const out = formatUnifiedEngagementLog([
			{
				event_type: "$pageview",
				source: "posthog",
				page_url: "https://example.com/blog",
			},
			{
				event_type: "$pageview",
				source: "warehouse",
				page_url: "https://example.com/",
			},
		]);
		expect(out).toBeDefined();
		expect(out).toContain("Recorded events in merged sample: 2");
		expect(out).toContain("posthog");
		expect(out).toContain("warehouse");
	});

	test("returns undefined for empty events", () => {
		expect(formatUnifiedEngagementLog([])).toBeUndefined();
	});
});
