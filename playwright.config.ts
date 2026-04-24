import { defineConfig } from "@playwright/test";

// Dedicated port avoids reusing a stray `next dev` on :3000 that was started without
// NEXT_PUBLIC_POSTHOG_KEY (reuse would keep the wrong bundle/env).
const port = process.env.PLAYWRIGHT_PORT ?? "3005";
const baseURL = process.env.BASE_URL ?? `http://127.0.0.1:${port}`;

// blog-service (test-support build) and mock-anthropic sidecar ports.
const blogServicePort = process.env.BLOG_SERVICE_PORT ?? "8090";
const mockAnthropicPort = process.env.MOCK_ANTHROPIC_PORT ?? "9090";

// The blog-service binary must be pre-compiled before Playwright starts so that the
// webServer entry below is just a process-start (< 5s), not a cold Rust compile (45-120s).
// See ci.yml "Build blog-service (test-support)" step.
const blogServiceBin =
	process.env.BLOG_SERVICE_BIN ?? "./target/debug/blog-service";

// Synthetic DSN for e2e only (no credential). Built without a 32-hex literal so
// scripts/check-sentry-dsn-literals.sh does not false-positive.
const e2eSentryDsn = `https://${"0".repeat(32)}@o000000.ingest.us.sentry.io/0000001`;

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
	// Three servers are started in order. Playwright waits for each `url` to be reachable
	// before proceeding to the next. The blog-service and mock-anthropic entries have a
	// short timeout because both are pre-compiled/pre-built executables, not cold builds.
	webServer: [
		// 1. mock-anthropic sidecar — must start before blog-service so ANTHROPIC_BASE_URL resolves.
		{
			command: `MOCK_ANTHROPIC_PORT=${mockAnthropicPort} bun run scripts/e2e/mock-anthropic.ts`,
			url: `http://127.0.0.1:${mockAnthropicPort}/__calls`,
			timeout: 15_000,
			reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "1",
		},
		// 2. blog-service binary (pre-compiled, test-support feature, in-memory profile store).
		//    ANTHROPIC_BASE_URL points at the mock sidecar above.
		{
			command: [
				`PORT=${blogServicePort}`,
				`BLOG_SERVICE_DB=memory`,
				`ANTHROPIC_API_KEY=test-key`,
				`ANTHROPIC_BASE_URL=http://127.0.0.1:${mockAnthropicPort}`,
				blogServiceBin,
			].join(" "),
			url: `http://127.0.0.1:${blogServicePort}/health`,
			timeout: 15_000,
			reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "1",
			env: {
				PORT: blogServicePort,
				BLOG_SERVICE_DB: "memory",
				ANTHROPIC_API_KEY: "test-key",
				ANTHROPIC_BASE_URL: `http://127.0.0.1:${mockAnthropicPort}`,
			},
		},
		// 3. Next.js dev server — started last; BLOG_SERVICE_URL points at the binary above.
		{
			command: `PORT=${port} BLOG_SERVICE_URL=http://127.0.0.1:${blogServicePort} NEXT_PUBLIC_SENTRY_DSN=${e2eSentryDsn} bun run dev`,
			url: baseURL,
			reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "1",
			timeout: 120_000,
		},
	],
});
