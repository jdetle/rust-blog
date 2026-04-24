import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

function readRel(pathFromRoot: string): string {
	return readFileSync(join(root, pathFromRoot), "utf8");
}

describe("Sentry Next.js wiring", () => {
	test("instrumentation.ts loads Sentry configs and exports onRequestError", () => {
		const s = readRel("instrumentation.ts");
		expect(s).toContain("sentry.server.config");
		expect(s).toContain("sentry.edge.config");
		expect(s).toContain("onRequestError");
		expect(s).toContain("NEXT_RUNTIME");
	});

	test("instrumentation-client gates init on NEXT_PUBLIC_SENTRY_DSN", () => {
		const s = readRel("instrumentation-client.ts");
		expect(s).toContain("NEXT_PUBLIC_SENTRY_DSN");
		expect(s).toContain("Sentry.init");
		expect(s).toMatch(/typeof sentryDsn === "string"/);
	});

	test("sentry server and edge configs gate init on non-empty DSN", () => {
		for (const f of ["sentry.server.config.ts", "sentry.edge.config.ts"]) {
			const s = readRel(f);
			expect(s).toContain("NEXT_PUBLIC_SENTRY_DSN");
			expect(s).toContain("Sentry.init");
			expect(s).toMatch(/typeof dsn === "string"/);
			expect(s).toMatch(/dsn\.length > 0/);
		}
	});

	test("next.config uses withSentryConfig and tunnelRoute", () => {
		const s = readRel("next.config.ts");
		expect(s).toContain("withSentryConfig");
		expect(s).toContain("tunnelRoute");
		expect(s).toContain("rust-blog-nextjs");
	});

	test("global-error reports to Sentry", () => {
		const s = readRel("app/global-error.tsx");
		expect(s).toContain("@sentry/nextjs");
		expect(s).toContain("captureException");
	});

	test(".env.example documents Sentry variables", () => {
		const s = readRel(".env.example");
		expect(s).toContain("NEXT_PUBLIC_SENTRY_DSN");
		expect(s).toMatch(/SENTRY_AUTH_TOKEN/i);
		expect(s).toContain("SENTRY_DSN=");
		expect(s).toContain("docs/sentry-human-followups.md");
	});
});
