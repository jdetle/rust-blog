import { expect, test } from "@playwright/test";

/**
 * E2E test: avatar generation via the /who-are-you page and the home-page hero.
 *
 * Requires three services running (started by playwright.config.ts webServer array):
 *   1. Next.js dev server  (BLOG_SERVICE_URL pointing at blog-service)
 *   2. blog-service binary (BLOG_SERVICE_DB=memory, ANTHROPIC_BASE_URL=mock sidecar)
 *   3. mock-anthropic      (scripts/e2e/mock-anthropic.ts)
 *
 * The blog-service binary must be pre-compiled with --features test-support before
 * Playwright starts; see ci.yml "Build blog-service (test-support)" step.
 *
 * For the new PNG collage flow, the generate-avatar API route is mocked at the
 * network level so we don't need a live OpenAI key in CI.
 */

const MOCK_ANTHROPIC_URL =
	process.env.MOCK_ANTHROPIC_URL ?? "http://127.0.0.1:9090";
const BLOG_SERVICE_URL =
	process.env.BLOG_SERVICE_URL ?? "http://127.0.0.1:8090";

/** Minimal 1×1 transparent PNG as a data URI (for fixture responses). */
const FIXTURE_PNG_DATA_URI =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

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

// ── Legacy SVG path ────────────────────────────────────────────────────

test("avatar SVG renders on /who-are-you (legacy path)", async ({ page }) => {
	await page.goto("/who-are-you");

	const avatarContainer = page.locator(
		".fingerprint-avatar-svg, .fingerprint-avatar-img",
	);
	await expect(avatarContainer).toBeVisible({ timeout: 45_000 });
});

test("avatar is served from cache on reload without a second Anthropic call", async ({
	page,
}) => {
	await page.goto("/who-are-you");

	const avatarContainer = page.locator(
		".fingerprint-avatar-svg, .fingerprint-avatar-img",
	);
	await expect(avatarContainer).toBeVisible({ timeout: 45_000 });
	const callsAfterFirst = await getMockCallCount();

	await page.reload();
	await expect(
		page.locator(".fingerprint-avatar-svg, .fingerprint-avatar-img"),
	).toBeVisible({ timeout: 30_000 });

	const callsAfterReload = await getMockCallCount();
	expect(callsAfterReload).toBe(callsAfterFirst);
});

// ── PNG collage path (mocked generate-avatar route) ───────────────────

test("home hero renders PNG avatar when generate-avatar returns avatar_url", async ({
	page,
}) => {
	// Stub Turnstile so widget fires immediately without a real challenge.
	await page.addInitScript(() => {
		window.turnstile = {
			render: (
				container: HTMLElement | string,
				options: { callback?: (token: string) => void },
			) => {
				setTimeout(() => options.callback?.("test-turnstile-token"), 50);
				return "widget-id";
			},
			reset: () => {},
			remove: () => {},
		};
	});

	// Mock /api/analytics/user-profile to return no existing avatar.
	await page.route("**/api/analytics/user-profile**", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				summary: null,
				updated_at: null,
				persona_guess: null,
				avatar_svg: null,
				avatar_url: null,
			}),
		});
	});

	// Mock /api/analytics/generate-avatar to return a fixture PNG.
	await page.route("**/api/analytics/generate-avatar", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				persona_guess: "Probably a curious builder — just a guess.",
				avatar_url: FIXTURE_PNG_DATA_URI,
				avatar_svg: null,
				cached: false,
			}),
		});
	});

	await page.goto("/");

	// The home-fingerprint-avatar component renders <img class="home-fingerprint-avatar-img">.
	const img = page.locator("img.home-fingerprint-avatar-img");
	await expect(img).toBeVisible({ timeout: 30_000 });

	const src = await img.getAttribute("src");
	expect(src).toMatch(/^data:image\/png;base64,/);
});

test("home hero falls back gracefully when generate-avatar returns 403 (captcha failure)", async ({
	page,
}) => {
	// No Turnstile stub — widget never fires (simulating blocked challenge).
	// Also stub generate-avatar to return 403 immediately.
	await page.route("**/api/analytics/user-profile**", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				summary: null,
				updated_at: null,
				persona_guess: null,
				avatar_svg: null,
				avatar_url: null,
			}),
		});
	});

	await page.route("**/api/analytics/generate-avatar", async (route) => {
		await route.fulfill({
			status: 403,
			contentType: "application/json",
			body: JSON.stringify({ error: "Captcha verification failed" }),
		});
	});

	// Stub Turnstile to fire a token quickly so the flow runs but 403 is returned.
	await page.addInitScript(() => {
		window.turnstile = {
			render: (
				container: HTMLElement | string,
				options: { callback?: (token: string) => void },
			) => {
				setTimeout(() => options.callback?.("bad-token"), 50);
				return "widget-id";
			},
			reset: () => {},
			remove: () => {},
		};
	});

	await page.goto("/");

	// Avatar should be absent (no img, no svg container, no skeleton) after 5s.
	await page.waitForTimeout(5_000);
	const img = page.locator("img.home-fingerprint-avatar-img");
	const svg = page.locator(".home-fingerprint-avatar-svg");
	await expect(img).toBeHidden();
	await expect(svg).toBeHidden();
});

// ── Service health ─────────────────────────────────────────────────────

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
