import { describe, expect, test } from "bun:test";
import {
	analyzeCommonVpnExitGeography,
	computeVpnExitLocationHeuristic,
} from "./vpn-detect";

describe("computeVpnExitLocationHeuristic", () => {
	test("returns null for unknown country", () => {
		expect(
			computeVpnExitLocationHeuristic({
				ip: "1.1.1.1",
				city: "X",
				region: null,
				country: "ZZ",
				latitude: null,
				longitude: null,
				timezone: null,
				asn: null,
				org: null,
				isEU: false,
			}),
		).toBeNull();
	});

	test("NL Amsterdam gets boosted probability", () => {
		const a = computeVpnExitLocationHeuristic({
			ip: "x",
			city: "Amsterdam",
			region: null,
			country: "NL",
			latitude: null,
			longitude: null,
			timezone: null,
			asn: null,
			org: null,
			isEU: true,
		});
		expect(a).not.toBeNull();
		expect(a?.countryCode).toBe("NL");
		expect(a?.probabilityPercent).toBeGreaterThan(32);
		expect(a?.summary).toContain("NL");
		expect(a?.summary).toContain("%");
	});

	test("analyzeCommonVpnExitGeography marks detected for NL", () => {
		const s = analyzeCommonVpnExitGeography({
			ip: "x",
			city: "Rotterdam",
			region: null,
			country: "NL",
			latitude: null,
			longitude: null,
			timezone: null,
			asn: null,
			org: null,
			isEU: true,
		});
		expect(s.detected).toBe(true);
		expect(s.name).toBe("Common VPN exit geography");
	});
});
