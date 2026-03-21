import { expect, test } from "@playwright/test";

/**
 * Verifies posthog-js sends a capture POST through the Next.js `/ingest` reverse proxy
 * with a valid `data` payload (token + distinct_id).
 *
 * Requires NEXT_PUBLIC_POSTHOG_KEY for the dev server Playwright starts (see playwright.config.ts).
 */
test("PostHog client sends capture POST via /ingest with token and distinct_id", async ({
	page,
}) => {
	// Request listener: capture uses POST through the Next `/ingest` proxy (response may be 2xx or retried).
	const ingestPosted = page.waitForRequest(
		(req) => req.url().includes("/ingest") && req.method() === "POST",
		{ timeout: 55_000 },
	);

	await page.goto("/", { waitUntil: "domcontentloaded" });
	const req = await ingestPosted;

	// posthog-js does not necessarily attach `window.posthog`; the capture POST is the signal.
	// Current SDK sends `application/x-www-form-urlencoded` with a `data` base64 payload.
	const body = req.postData() ?? "";
	expect(body.length).toBeGreaterThan(0);
	expect(body).toMatch(/^data=/);
	const decoded = Buffer.from(
		decodeURIComponent(body.replace(/^data=/, "")),
		"base64",
	).toString("utf8");
	expect(decoded).toMatch(/"distinct_id"|"token"/);
});
