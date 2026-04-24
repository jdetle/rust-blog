import { expect, test } from "@playwright/test";

/**
 * E2E test: single composite avatar generation via the /who-are-you page and home-page hero.
 *
 * The generate-avatar and observations routes are mocked at the network level so tests
 * run without a live OpenAI key or a full blog-service in CI.
 */

const BLOG_SERVICE_URL =
	process.env.BLOG_SERVICE_URL ?? "http://127.0.0.1:8090";

/** Minimal 1×1 transparent PNG as a data URI (for fixture responses). */
const FIXTURE_PNG_DATA_URI =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/** Second minimal PNG (different bytes than FIXTURE_PNG_DATA_URI). */
const FIXTURE_PNG_DATA_URI_2 =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const FIXTURE_OBSERVATIONS = [
	"You are browsing from Tokyo, Japan.",
	"Your browser is Firefox 124 on macOS.",
	"Your GPU is Apple M3.",
	"Dark mode is enabled.",
	"You are on a residential connection.",
	"Your screen resolution is 2560x1664.",
];

/** Matches `AVATAR_LABEL` on `HomeFingerprintAvatar` portrait `<img>`. */
const AVATAR_IMG_ALT =
	"A personalised portrait generated from regional art traditions and your browser signals. Updates each calendar day.";

/** Home can be slow on cold `next dev` / Turbopack; avoid hanging on `load`. */
async function gotoHome(page: import("@playwright/test").Page) {
	await page.goto("/", {
		waitUntil: "domcontentloaded",
		timeout: 120_000,
	});
}

// ── Helper: stub Turnstile ────────────────────────────────────────────

async function stubTurnstile(
	page: import("@playwright/test").Page,
	token = "test-turnstile-token",
) {
	await page.addInitScript((t) => {
		window.turnstile = {
			ready: (cb: () => void) => {
				queueMicrotask(cb);
			},
			render: (
				_container: HTMLElement | string,
				options: { callback?: (tok: string) => void },
			) => {
				setTimeout(() => options.callback?.(t), 50);
				return "widget-id";
			},
			reset: () => {},
			remove: () => {},
		};
	}, token);
}

// ── Helper: stub analytics routes ────────────────────────────────────

async function stubAnalyticsRoutes(
	page: import("@playwright/test").Page,
	options: {
		hasCache?: boolean;
		generateFails?: boolean;
		/** When set with hasCache, profile returns this full history (newest first). */
		cachedAvatarUrls?: string[];
		/** Override my-events body (e.g. sparse sample); default empty list. */
		myEventsBody?: unknown;
	} = {},
) {
	const myEventsPayload =
		options.myEventsBody !== undefined ? options.myEventsBody : { events: [] };

	await page.route("**/api/analytics/my-events**", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(myEventsPayload),
		});
	});

	const cacheUrls =
		options.cachedAvatarUrls && options.cachedAvatarUrls.length > 0
			? options.cachedAvatarUrls
			: options.hasCache
				? [FIXTURE_PNG_DATA_URI]
				: [];

	await page.route("**/api/analytics/user-profile**", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				summary: null,
				updated_at: null,
				persona_guess: "Fixture persona",
				avatar_url: cacheUrls[0] ?? null,
				avatar_urls: cacheUrls,
				avatar_history_len: cacheUrls.length,
			}),
		});
	});

	if (!options.hasCache) {
		await page.route("**/api/analytics/generate-avatar", async (route) => {
			if (options.generateFails) {
				await route.fulfill({
					status: 403,
					contentType: "application/json",
					body: JSON.stringify({ error: "Captcha verification failed" }),
				});
			} else {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						persona_guess: "Probably a curious builder — just a guess.",
						avatar_url: FIXTURE_PNG_DATA_URI,
						cached: false,
					}),
				});
			}
		});

		await page.route("**/api/analytics/observations", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ observations: FIXTURE_OBSERVATIONS }),
			});
		});
	}
}

// ── Home hero tests ───────────────────────────────────────────────────
// Serial: parallel workers + per-page route stubs caused flaky 0-count img assertions.
test.describe("home hero", () => {
	test.describe.configure({ mode: "serial" });

	test("home hero renders single portrait when generate-avatar returns avatar_url", async ({
		page,
	}) => {
		await stubTurnstile(page);
		await stubAnalyticsRoutes(page);
		await gotoHome(page);

		// The component renders one <img class="home-fingerprint-avatar-img"> inside the frame.
		const imgs = page.locator("img.home-fingerprint-avatar-img");
		await expect(imgs).toHaveCount(1, { timeout: 30_000 });

		const src = await imgs.first().getAttribute("src");
		expect(src).toMatch(/^data:image\/png;base64,/);
	});

	test("home hero surfaces every cached avatar_urls slide even when my-events implies one visit day", async ({
		page,
	}) => {
		const history = [
			FIXTURE_PNG_DATA_URI,
			FIXTURE_PNG_DATA_URI_2,
			"data:image/png;base64,YQ==",
		];
		await stubTurnstile(page);
		await stubAnalyticsRoutes(page, {
			hasCache: true,
			cachedAvatarUrls: history,
			myEventsBody: {
				events: [
					{
						event_id: "e1",
						event_type: "$pageview",
						source: "warehouse",
						page_url: "/",
						event_date: "2026-01-15",
						event_time: Date.UTC(2026, 0, 15, 12, 0, 0),
					},
				],
			},
		});

		let generateCalled = false;
		await page.route("**/api/analytics/generate-avatar", async (route) => {
			generateCalled = true;
			await route.fulfill({ status: 200, body: "{}" });
		});

		await gotoHome(page);

		await expect(page.getByRole("img", { name: AVATAR_IMG_ALT })).toBeVisible({
			timeout: 15_000,
		});

		// Carousel tablist: one tab per portrait — must not be capped by sparse my-events.
		await expect(
			page.getByRole("tab", { name: /Portrait 1 of 3/ }),
		).toBeVisible();
		await expect(
			page.getByRole("tab", { name: /Portrait 3 of 3/ }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Next portrait in history" }),
		).toBeVisible();
		expect(generateCalled).toBe(false);
	});

	/** Proves the carousel is driven by `user-profile.avatar_urls`, not by my-events length. */
	test("home hero shows full avatar_urls count when my-events is empty (server is source of truth)", async ({
		page,
	}) => {
		const fourSlides = [
			FIXTURE_PNG_DATA_URI,
			FIXTURE_PNG_DATA_URI_2,
			"data:image/png;base64,YQ==",
			"data:image/png;base64,Yg==",
		];
		await stubTurnstile(page);
		await stubAnalyticsRoutes(page, {
			hasCache: true,
			cachedAvatarUrls: fourSlides,
			myEventsBody: { events: [] },
		});

		await page.route("**/api/analytics/generate-avatar", async (route) => {
			await route.fulfill({ status: 200, body: "{}" });
		});

		await gotoHome(page);

		await expect(
			page.getByRole("img", { name: AVATAR_IMG_ALT }),
		).toBeVisible({ timeout: 20_000 });
		for (const n of [1, 2, 3, 4] as const) {
			await expect(
				page.getByRole("tab", { name: new RegExp(`Portrait ${n} of 4`) }),
			).toBeVisible();
		}
	});

	test("home hero loads from cache without calling generate-avatar", async ({
		page,
	}) => {
		await stubTurnstile(page);
		await stubAnalyticsRoutes(page, { hasCache: true });

		// Track whether generate-avatar was called (should not be).
		let generateCalled = false;
		await page.route("**/api/analytics/generate-avatar", async (route) => {
			generateCalled = true;
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: "{}",
			});
		});

		await gotoHome(page);

		const imgs = page.locator("img.home-fingerprint-avatar-img");
		await expect(imgs).toHaveCount(1, { timeout: 15_000 });
		expect(generateCalled).toBe(false);
	});

	test("home hero is absent when generate-avatar fails", async ({ page }) => {
		await stubTurnstile(page, "bad-token");
		await stubAnalyticsRoutes(page, { generateFails: true });
		await gotoHome(page);

		// Avatar container should disappear after the failed call.
		await page.waitForTimeout(5_000);
		const imgs = page.locator("img.home-fingerprint-avatar-img");
		await expect(imgs).toHaveCount(0);
	});

	/**
	 * Local cache shows a carousel image immediately; delayed user-profile then
	 * expands to the full `avatar_urls` list (fingerprint 55f067dd in dev only).
	 */
	test("home hero: slow user-profile — carousel first from cache, then all server images", async ({
		page,
	}, testInfo) => {
		// Stagger: three projects hit one Next dev instance; a burst of navigations can abort streams.
		if (testInfo.parallelIndex > 0) {
			await page.waitForTimeout(testInfo.parallelIndex * 1_200);
		}
		const fp = "55f067dd";
		const fullHistory = [
			FIXTURE_PNG_DATA_URI,
			FIXTURE_PNG_DATA_URI_2,
			"data:image/png;base64,YQ==",
		];
		const oneLocal = JSON.stringify([FIXTURE_PNG_DATA_URI]);
		const storageKey = `jdetle.avatar.history.v1.${fp}`;

		await page.addInitScript(
			`window.__PLAYWRIGHT_FP__ = ${JSON.stringify(fp)};
			localStorage.setItem(${JSON.stringify(storageKey)}, ${JSON.stringify(oneLocal)});`,
		);

		await stubTurnstile(page);
		await page.route("**/api/analytics/my-events**", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ events: [] }),
			});
		});
		await page.route("**/api/analytics/user-profile**", async (route) => {
			await new Promise((r) => {
				setTimeout(r, 3_500);
			});
			await route.fulfill({
				status: 200,
				headers: {
					"Content-Type": "application/json; charset=utf-8",
					"Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0",
				},
				body: JSON.stringify({
					summary: null,
					updated_at: null,
					persona_guess: null,
					avatar_url: fullHistory[0] ?? null,
					avatar_urls: fullHistory,
					avatar_history_len: fullHistory.length,
				}),
			});
		});
		await page.route("**/api/analytics/generate-avatar**", async (route) => {
			await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
		});

		await gotoHome(page);

		// user-profile is delayed 3.5s: local cache (1 img) can show first; no dots until 2+ slides.
		const heroImg = page.locator("img.home-fingerprint-avatar-img");
		await expect(heroImg).toBeVisible({ timeout: 8_000 });
		const prefetchSync = page.getByTestId(
			"home-fingerprint-avatar-prefetch-sync",
		);
		await expect(prefetchSync).toBeVisible({ timeout: 4_000 });

		await expect(
			page.getByRole("tab", { name: /Portrait 1 of 3/ }),
		).toBeVisible({ timeout: 20_000 });
		await expect(
			page.getByRole("tab", { name: /Portrait 3 of 3/ }),
		).toBeVisible();
	});
});

test.describe("production API (opt-in)", () => {
	test("GET /api/analytics/user-profile?fingerprint=55f067dd returns at least one PNG", async () => {
		test.skip(
			process.env.E2E_PROD_JDETLE !== "1",
			"set E2E_PROD_JDETLE=1 to run production user-profile check",
		);
		const base = "https://www.jdetle.com";
		const url = new URL("/api/analytics/user-profile", base);
		url.searchParams.set("fingerprint", "55f067dd");
		const res = await fetch(url.href, {
			headers: { Accept: "application/json" },
		});
		expect(res.status).toBe(200);
		const data = (await res.json()) as {
			avatar_urls?: unknown;
			avatar_url?: unknown;
		};
		const urls = Array.isArray(data.avatar_urls) ? data.avatar_urls : [];
		const fromSingle =
			typeof data.avatar_url === "string" ? [data.avatar_url] : [];
		const combined = [
			...urls.filter(
				(u: unknown) =>
					typeof u === "string" && (u as string).startsWith("data:image/png"),
			),
			...fromSingle.filter((u) => u.startsWith("data:image/png")),
		];
		// If this fails, seed a portrait for this fingerprint in analytics storage.
		expect(combined.length).toBeGreaterThanOrEqual(1);
	});
});

// ── Who-are-you page tests ────────────────────────────────────────────

test("who-are-you page renders avatar in composite picture section", async ({
	page,
}) => {
	await stubTurnstile(page);
	await stubAnalyticsRoutes(page);
	await page.goto("/who-are-you");

	const frame = page.locator(
		".fingerprint-avatar-block .home-fingerprint-avatar-frame",
	);
	await expect(frame).toBeVisible({ timeout: 45_000 });

	const img = frame.locator("img.home-fingerprint-avatar-img");
	await expect(img).toHaveCount(1, { timeout: 5_000 });
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
