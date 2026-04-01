#!/usr/bin/env bun
/**
 * Non-destructive smoke tests against a deploy preview URL.
 * GET-only; no mutations. Used by CI to validate Vercel preview deployments.
 */

const url = process.env.PREVIEW_URL ?? process.argv[2];
if (!url) {
	console.error("Usage: PREVIEW_URL=<url> bun run scripts/e2e-preview.ts");
	console.error("   or: bun run scripts/e2e-preview.ts <url>");
	process.exit(1);
}

const base = url.replace(/\/$/, "");
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const headers: Record<string, string> = {};
if (bypassSecret) {
	headers["x-vercel-protection-bypass"] = bypassSecret;
}

const endpoints = [
	{ path: "/", name: "home" },
	{ path: "/posts", name: "posts" },
	{ path: "/posts/2020-year-in-review", name: "post detail" },
	{ path: "/who-are-you", name: "who-are-you" },
];

async function main() {
	let failed = 0;
	for (const { path, name } of endpoints) {
		const target = `${base}${path}`;
		try {
			const res = await fetch(target, {
				method: "GET",
				redirect: "follow",
				headers,
			});
			if (!res.ok) {
				console.error(
					`FAIL ${name} ${target}: ${res.status} ${res.statusText}`,
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
