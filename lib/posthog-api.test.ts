import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	fetchEventCountRecentHours,
	fetchEventsByDistinctId,
	fetchEventsByQuery,
} from "./posthog-api";

describe("posthog-api", () => {
	let originalFetch: typeof fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	test("fetchEventsByQuery maps HogQL rows", async () => {
		globalThis.fetch = async () =>
			new Response(
				JSON.stringify({
					columns: ["event", "distinct_id", "timestamp", "properties"],
					results: [
						["pageview", "u1", "2024-01-01T00:00:00Z", { $browser: "Chrome" }],
					],
				}),
				{ status: 200 },
			);

		const events = await fetchEventsByQuery(["u1"], {
			personalApiKey: "phx_test",
			projectId: "1",
			limit: 10,
			daysBack: 7,
		});

		expect(events).toHaveLength(1);
		expect(events[0].event).toBe("pageview");
		expect(events[0].distinct_id).toBe("u1");
	});

	test("fetchEventsByQuery returns empty on auth failure", async () => {
		globalThis.fetch = async () => new Response("no", { status: 401 });

		const events = await fetchEventsByQuery(["u1"], {
			personalApiKey: "bad",
			projectId: "1",
		});

		expect(events).toEqual([]);
	});

	test("fetchEventsByDistinctId returns Events API results", async () => {
		globalThis.fetch = async () =>
			new Response(
				JSON.stringify({
					results: [
						{
							id: "evt1",
							event: "$pageview",
							distinct_id: "d1",
							timestamp: "2024-01-01T00:00:00Z",
							properties: { $current_url: "https://example.com/a" },
						},
					],
				}),
				{ status: 200 },
			);

		const events = await fetchEventsByDistinctId("d1", {
			personalApiKey: "phx_test",
			projectId: "346322",
		});

		expect(events).toHaveLength(1);
		expect(events[0].distinct_id).toBe("d1");
		expect(events[0].event).toBe("$pageview");
	});

	test("fetchEventCountRecentHours parses numeric count", async () => {
		globalThis.fetch = async () =>
			new Response(
				JSON.stringify({
					columns: ["c"],
					results: [[42]],
				}),
				{ status: 200 },
			);

		const c = await fetchEventCountRecentHours(2, {
			personalApiKey: "phx_test",
			projectId: "1",
		});

		expect(c).toBe(42);
	});

	test("fetchEventCountRecentHours parses string count", async () => {
		globalThis.fetch = async () =>
			new Response(
				JSON.stringify({
					columns: ["c"],
					results: [["7"]],
				}),
				{ status: 200 },
			);

		const c = await fetchEventCountRecentHours(2, {
			personalApiKey: "phx_test",
			projectId: "1",
		});

		expect(c).toBe(7);
	});

	test("fetchEventCountRecentHours returns null when missing credentials", async () => {
		const c = await fetchEventCountRecentHours(2, {
			personalApiKey: "",
			projectId: "1",
		});
		expect(c).toBeNull();
	});
});
