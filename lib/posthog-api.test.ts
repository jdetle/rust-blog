import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { fetchEventCountRecentHours } from "./posthog-api";

describe("posthog-api fetchEventCountRecentHours", () => {
	let originalFetch: typeof fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	test("parses numeric count", async () => {
		globalThis.fetch = async () =>
			new Response(JSON.stringify({ columns: ["c"], results: [[42]] }), {
				status: 200,
			});

		const c = await fetchEventCountRecentHours(2, {
			personalApiKey: "phx_x",
			projectId: "1",
		});
		expect(c).toBe(42);
	});

	test("returns null when missing credentials", async () => {
		const c = await fetchEventCountRecentHours(2, {
			personalApiKey: "",
			projectId: "1",
		});
		expect(c).toBeNull();
	});
});
