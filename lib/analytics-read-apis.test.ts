import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	fetchAnalyticsWarehouseHealth,
	fetchClarityExportReadable,
	fetchPlausibleAggregateReadable,
} from "./analytics-read-apis";

describe("analytics-read-apis", () => {
	let originalFetch: typeof fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	test("fetchClarityExportReadable succeeds on 200 JSON", async () => {
		globalThis.fetch = async () =>
			new Response(JSON.stringify([{ URL: "https://x.com" }]), { status: 200 });

		const r = await fetchClarityExportReadable({ token: "t" });
		expect(r.ok).toBe(true);
	});

	test("fetchClarityExportReadable fails on non-https URL", async () => {
		const r = await fetchClarityExportReadable({
			token: "t",
			exportUrl: "http://evil.com/x",
		});
		expect(r.ok).toBe(false);
	});

	test("fetchPlausibleAggregateReadable succeeds on stats shape", async () => {
		globalThis.fetch = async () =>
			new Response(JSON.stringify({ results: { visitors: { value: 1 } } }), {
				status: 200,
			});

		const r = await fetchPlausibleAggregateReadable({
			apiKey: "k",
			siteId: "example.com",
		});
		expect(r.ok).toBe(true);
	});

	test("fetchAnalyticsWarehouseHealth accepts ok body", async () => {
		globalThis.fetch = async () => new Response("ok", { status: 200 });

		const r = await fetchAnalyticsWarehouseHealth("http://localhost:8080");
		expect(r.ok).toBe(true);
	});

	test("fetchAnalyticsWarehouseHealth rejects non-http origin", async () => {
		const r = await fetchAnalyticsWarehouseHealth("ftp://localhost/");
		expect(r.ok).toBe(false);
	});
});
