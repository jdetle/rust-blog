import { defineConfig } from "@playwright/test";

// Dedicated port avoids reusing a stray `next dev` on :3000 that was started without
// NEXT_PUBLIC_POSTHOG_KEY (reuse would keep the wrong bundle/env).
const port = process.env.PLAYWRIGHT_PORT ?? "3005";
const baseURL = process.env.BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
	testDir: "e2e",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? "github" : "list",
	timeout: 60_000,
	use: {
		baseURL,
		trace: "on-first-retry",
		browserName: "chromium",
	},
	// Chromium + viewports only (no WebKit) so `playwright install chromium` suffices in CI.
	projects: [
		{
			name: "mobile",
			use: { viewport: { width: 375, height: 812 } },
		},
		{
			name: "tablet",
			use: { viewport: { width: 768, height: 1024 } },
		},
		{
			name: "desktop",
			use: { viewport: { width: 1280, height: 720 } },
		},
	],
	webServer: {
		command: `PORT=${port} bun run dev`,
		url: baseURL,
		reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "1",
		timeout: 120_000,
	},
});
