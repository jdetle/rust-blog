import { expect, test } from "@playwright/test";

/**
 * Ensures the browser SDK POSTs envelopes through the Next.js Sentry tunnel (`/monitoring`).
 * Playwright starts `next dev` with NEXT_PUBLIC_SENTRY_DSN set in playwright.config.ts
 * (synthetic DSN — not a secret; upstream may reject, we only assert the tunnel request).
 */
test("Sentry client POSTs to /monitoring tunnel after sample error", async ({
	page,
}) => {
	const monitoringPosted = page.waitForRequest(
		(req) => req.url().includes("/monitoring") && req.method() === "POST",
		{ timeout: 55_000 },
	);

	await page.goto("/sentry-example-page", { waitUntil: "domcontentloaded" });
	await expect(
		page.getByRole("button", { name: /throw sample error/i }),
	).toBeEnabled({ timeout: 15_000 });

	await page.getByRole("button", { name: /throw sample error/i }).click();

	const req = await monitoringPosted;
	const body = req.postData();
	expect(body).not.toBeNull();
	expect((body as string).length).toBeGreaterThan(10);
});
