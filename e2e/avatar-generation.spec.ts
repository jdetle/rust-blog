import { expect, test } from "@playwright/test";

/**
 * E2E test: avatar SVG generation via the /who-are-you page.
 *
 * Requires three services running (started by playwright.config.ts webServer array):
 *   1. Next.js dev server  (BLOG_SERVICE_URL pointing at blog-service)
 *   2. blog-service binary (BLOG_SERVICE_DB=memory, ANTHROPIC_BASE_URL=mock sidecar)
 *   3. mock-anthropic      (scripts/e2e/mock-anthropic.ts)
 *
 * The blog-service binary must be pre-compiled with --features test-support before
 * Playwright starts; see ci.yml "Build blog-service (test-support)" step.
 */

const MOCK_ANTHROPIC_URL =
	process.env.MOCK_ANTHROPIC_URL ?? "http://127.0.0.1:9090";
const BLOG_SERVICE_URL =
	process.env.BLOG_SERVICE_URL ?? "http://127.0.0.1:8090";

async function resetMockCalls() {
	await fetch(`${MOCK_ANTHROPIC_URL}/__reset`, { method: "POST" }).catch(
		() => {},
	);
}

async function getMockCallCount(): Promise<number> {
	try {
		const res = await fetch(`${MOCK_ANTHROPIC_URL}/__calls`);
		const json = (await res.json()) as { calls: number };
		return json.calls;
	} catch {
		return -1;
	}
}

test.beforeEach(async () => {
	await resetMockCalls();
});

test("avatar SVG renders on /who-are-you", async ({ page }) => {
	await page.goto("/who-are-you");

	// The component uses class `fingerprint-avatar-svg` with dangerouslySetInnerHTML
	// to inject the SVG. Wait for the SVG child element to appear inside that container.
	// Fingerprinting + API round-trip can take several seconds in CI.
	const avatarContainer = page.locator(".fingerprint-avatar-svg");
	await expect(avatarContainer).toBeVisible({ timeout: 45_000 });

	const avatarSvg = avatarContainer.locator("svg").first();
	await expect(avatarSvg).toBeVisible({ timeout: 5_000 });

	const svgHtml = await avatarSvg.evaluate((el) => el.outerHTML);
	expect(svgHtml).toContain("<svg");
	expect(svgHtml).not.toContain("<script");
});

test("avatar is served from cache on reload without a second Anthropic call", async ({
	page,
}) => {
	await page.goto("/who-are-you");

	const avatarContainer = page.locator(".fingerprint-avatar-svg");
	await expect(avatarContainer).toBeVisible({ timeout: 45_000 });
	const avatarSvg = avatarContainer.locator("svg").first();
	await expect(avatarSvg).toBeVisible({ timeout: 5_000 });

	const svgAfterFirstLoad = await avatarSvg.evaluate((el) => el.outerHTML);
	const callsAfterFirst = await getMockCallCount();

	// Reload the page — the in-memory store should serve the cached avatar.
	await page.reload();
	const avatarContainerReload = page.locator(".fingerprint-avatar-svg");
	await expect(avatarContainerReload).toBeVisible({ timeout: 30_000 });
	const avatarSvgReload = avatarContainerReload.locator("svg").first();
	await expect(avatarSvgReload).toBeVisible({ timeout: 5_000 });

	const svgAfterReload = await avatarSvgReload.evaluate((el) => el.outerHTML);
	expect(svgAfterReload).toBe(svgAfterFirstLoad);

	const callsAfterReload = await getMockCallCount();
	expect(callsAfterReload).toBe(callsAfterFirst);
});

test("blog-service health endpoint is reachable", async () => {
	const res = await fetch(`${BLOG_SERVICE_URL}/health`);
	expect(res.status).toBe(200);
});

test("v1/info returns service field", async () => {
	const res = await fetch(`${BLOG_SERVICE_URL}/v1/info`);
	expect(res.status).toBe(200);
	const body = (await res.json()) as { service: string };
	expect(body.service).toBeTruthy();
});
