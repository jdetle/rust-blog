#!/usr/bin/env bun
/**
 * Verifies the mental health essay stays unlisted: no route, no listing entry.
 * Content remains in-repo under posts/ for local editing and unit tests that read files.
 *
 * Usage:
 *   bun run scripts/e2e-mental-health.ts http://localhost:3000
 *   PREVIEW_URL=<url> bun run scripts/e2e-mental-health.ts
 */

const url = process.env.PREVIEW_URL ?? process.argv[2];
if (!url) {
	console.error(
		"Usage: PREVIEW_URL=<url> bun run scripts/e2e-mental-health.ts",
	);
	console.error("   or: bun run scripts/e2e-mental-health.ts <url>");
	process.exit(1);
}

const base = url.replace(/\/$/, "");
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const headers: Record<string, string> = {};
if (bypassSecret) {
	headers["x-vercel-protection-bypass"] = bypassSecret;
}

const POST_SLUG = "how-agentic-engineering-landed-me-in-a-mental-hospital";
const POST_TITLE = "How Agentic Engineering Landed Me in a Mental Hospital";

let failed = 0;
let passed = 0;

function ok(name: string) {
	passed++;
	console.log(`  ✓ ${name}`);
}

function fail(name: string, reason: string) {
	failed++;
	console.error(`  ✗ ${name}: ${reason}`);
}

async function fetchPage(
	path: string,
): Promise<{ status: number; body: string }> {
	const target = `${base}${path}`;
	const res = await fetch(target, {
		method: "GET",
		redirect: "follow",
		headers,
	});
	const body = await res.text();
	return { status: res.status, body };
}

async function main() {
	console.log(`\nE2E: hidden mental health post — ${base}\n`);

	const postPath = `/posts/${POST_SLUG}`;
	const { status: postStatus } = await fetchPage(postPath);

	if (postStatus === 404) {
		ok(`GET ${postPath} returns 404 (unlisted)`);
	} else {
		fail(`GET ${postPath}`, `expected 404 for hidden post, got ${postStatus}`);
	}

	const { status: listStatus, body: listBody } = await fetchPage("/posts");
	if (listStatus === 200) {
		ok("GET /posts returns 200");
	} else {
		fail("GET /posts", `expected 200, got ${listStatus}`);
	}

	if (!listBody.includes(POST_SLUG)) {
		ok("post slug does not appear in /posts listing");
	} else {
		fail("listing leak", "hidden post slug found in /posts HTML");
	}

	if (!listBody.includes(POST_TITLE)) {
		ok("post title does not appear in /posts listing");
	} else {
		fail("listing leak", "hidden post title found in /posts HTML");
	}

	console.log(`\n${"─".repeat(50)}`);
	console.log(`Results: ${passed} passed, ${failed} failed`);
	console.log(`${"─".repeat(50)}\n`);

	process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
	console.error("E2E script failed:", err);
	process.exit(1);
});
