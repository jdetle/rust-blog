import { describe, expect, test } from "bun:test";
import {
	aggregateThirdPartyResources,
	computeExposureScore,
	hostnameFromResourceName,
} from "./third-party-resources";

describe("hostnameFromResourceName", () => {
	test("parses https URL", () => {
		expect(
			hostnameFromResourceName(
				"https://www.googletagmanager.com/gtm.js?id=G-1",
			),
		).toBe("www.googletagmanager.com");
	});
	test("returns null for invalid", () => {
		expect(hostnameFromResourceName("")).toBeNull();
	});
});

describe("aggregateThirdPartyResources", () => {
	test("excludes same origin", () => {
		const origin = "https://example.com";
		const entries = [
			{ name: "https://example.com/app.js", initiatorType: "script" },
			{ name: "https://other.cdn/foo.js", initiatorType: "script" },
			{ name: "https://other.cdn/bar.png", initiatorType: "img" },
		];
		const agg = aggregateThirdPartyResources(origin, entries);
		expect(agg).toHaveLength(1);
		expect(agg[0]?.host).toBe("other.cdn");
		expect(agg[0]?.count).toBe(2);
		expect(agg[0]?.initiatorTypes).toEqual(["img", "script"]);
	});

	test("empty when origin invalid", () => {
		expect(aggregateThirdPartyResources("not-a-url", [])).toEqual([]);
	});
});

describe("computeExposureScore", () => {
	test("caps at 100", () => {
		expect(
			computeExposureScore({
				activeTrackerCount: 20,
				thirdPartyHostCount: 50,
				storedEventCount: 500,
				vpnVerdict: "likely-vpn",
				vpnConfidence: 100,
			}),
		).toBe(100);
	});
	test("lower inputs yield lower score", () => {
		const low = computeExposureScore({
			activeTrackerCount: 0,
			thirdPartyHostCount: 0,
			storedEventCount: 0,
			vpnVerdict: "residential",
			vpnConfidence: 0,
		});
		const high = computeExposureScore({
			activeTrackerCount: 4,
			thirdPartyHostCount: 5,
			storedEventCount: 12,
			vpnVerdict: "residential",
			vpnConfidence: 0,
		});
		expect(low).toBeLessThan(high);
	});
});
