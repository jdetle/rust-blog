#!/usr/bin/env bun
/**
 * Visual regression check for production deployment.
 * Fetches key pages and asserts expected content is present.
 * Catches empty pages, broken rendering, and obvious regressions.
 *
 * Run: bun run scripts/visual-regression-check.ts
 * Or:  PRODUCTION_URL=https://custom.example.com bun run scripts/visual-regression-check.ts
 */

const productionBase =
	process.env.PRODUCTION_URL ??
	process.env.VERCEL_PROJECT_PRODUCTION_URL ??
	"https://jdetle.com";

const endpoints: Array<{
	path: string;
	name: string;
	/** At least one of these strings must appear in the response body */
	expectedContent: string[];
}> = [
	{
		path: "/",
		name: "home",
		expectedContent: ["John Detlefs", "Shipping resilient"],
	},
	{
		path: "/posts",
		name: "posts",
		expectedContent: ["posts", "Posts"],
	},
	{
		path: "/posts/2023-year-in-review",
		name: "post detail",
		expectedContent: ["2023", "year"],
	},
];

async function main(): Promise<void> {
	let failed = 0;
	const baseUrl = productionBase.replace(/\/$/, "");

	for (const { path, name, expectedContent } of endpoints) {
		const target = `${baseUrl}${path}`;
		try {
			const res = await fetch(target, {
				method: "GET",
				redirect: "follow",
				headers: { "User-Agent": "visual-regression-check/1.0" },
			});

			if (!res.ok) {
				console.error(
					`FAIL ${name} ${target}: ${res.status} ${res.statusText}`,
				);
				failed++;
				continue;
			}

			const html = await res.text();
			const found = expectedContent.some((s) => html.includes(s));
			if (!found) {
				console.error(
					`FAIL ${name} ${target}: expected content not found (looked for: ${expectedContent.join(" or ")})`,
				);
				failed++;
			} else {
				console.log(`OK ${name} ${target}`);
			}
		} catch (err) {
			console.error(`FAIL ${name} ${target}:`, err);
			failed++;
		}
	}

	process.exit(failed > 0 ? 1 : 0);
}

main();
