#!/usr/bin/env bun
/**
 * E2E smoke tests for the mental health blog post.
 * Runs against a live URL (dev server or deploy preview).
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

async function fetchPage(path: string): Promise<{ status: number; body: string }> {
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
	console.log(`\nE2E: mental health post — ${base}\n`);

	// ── Route accessibility ──────────────────────────────────

	console.log("Route accessibility:");

	const postPath = `/posts/${POST_SLUG}`;
	const { status: postStatus, body: postBody } = await fetchPage(postPath);

	if (postStatus === 200) {
		ok(`GET ${postPath} returns 200`);
	} else {
		fail(`GET ${postPath}`, `expected 200, got ${postStatus}`);
	}

	const { status: listStatus, body: listBody } = await fetchPage("/posts");
	if (listStatus === 200) {
		ok("GET /posts returns 200");
	} else {
		fail("GET /posts", `expected 200, got ${listStatus}`);
	}

	// ── Post appears in listing ──────────────────────────────

	console.log("\nPost listing:");

	if (listBody.includes(POST_SLUG)) {
		ok("post slug appears in /posts listing");
	} else {
		fail("post slug in listing", "slug not found in /posts HTML");
	}

	if (listBody.includes("How Prompt Engineering Landed Me in a Mental Hospital")) {
		ok("post title appears in /posts listing");
	} else {
		fail("post title in listing", "title not found in /posts HTML");
	}

	// ── Post page content ────────────────────────────────────

	console.log("\nPost page content:");

	const contentChecks: [string, string][] = [
		["has page title", "How Prompt Engineering Landed Me in a Mental Hospital"],
		["has author byline", "John Detlefs"],
		["has date", "March 20, 2026"],
		["in medias res opening (Monday)", "Monday morning"],
		["backstory section", "The Perfect Storm"],
		["Feb 27 section", "Voluntary Admission"],
		["Feb 28 section", "The Day That Broke Trust"],
		["March 1 section", "March 1"],
		["March 3 section", "The Lowest Point"],
		["March 5 hearing section", "The Hearing"],
		["stabilization section", "Stabilization"],
		["discharge section", "Discharge"],
		["self-reflection section", "Still Working On"],
		["accountability section", "Accountability"],
		["serenity prayer section", "Serenity Prayer"],
		["closing section", "In Repair"],
	];

	for (const [name, content] of contentChecks) {
		if (postBody.includes(content)) {
			ok(name);
		} else {
			fail(name, `"${content}" not found in post HTML`);
		}
	}

	// ── Interactive elements ─────────────────────────────────

	console.log("\nInteractive elements:");

	const detailsCount = (postBody.match(/<details/g) || []).length;
	if (detailsCount >= 5) {
		ok(`has ${detailsCount} expandable overlay sections`);
	} else {
		fail("expandable overlays", `expected >= 5, found ${detailsCount}`);
	}

	const summaryLabels = [
		"Hypomania vs. Mania",
		"Texas Patient Bill of Rights",
		"Dell Seton ER vs. Austin Oaks",
		"OCEAN System",
		"TMB Complaint",
	];

	for (const label of summaryLabels) {
		if (postBody.includes(label)) {
			ok(`overlay: ${label}`);
		} else {
			fail(`overlay: ${label}`, "summary text not found");
		}
	}

	// ── YouTube embed ────────────────────────────────────────

	console.log("\nYouTube embed:");

	if (postBody.includes("youtube.com/embed/LJS7Igvk6ZM")) {
		ok("YouTube iframe src is correct (In Repair)");
	} else {
		fail("YouTube embed", "iframe src not found");
	}

	if (postBody.includes("allowfullscreen")) {
		ok("iframe allows fullscreen");
	} else {
		fail("iframe fullscreen", "allowfullscreen not found");
	}

	if (postBody.match(/iframe[\s\S]*?title="[^"]+"/)) {
		ok("iframe has accessible title");
	} else {
		fail("iframe title", "no title attribute on iframe");
	}

	// ── Accountability table ─────────────────────────────────

	console.log("\nAccountability table:");

	const accountablePeople = [
		"Dr. Farruggi",
		"Richard Bennett",
		"Sam Cunningham",
		"David",
		"Austin Oaks / UHS",
	];

	for (const person of accountablePeople) {
		if (postBody.includes(person)) {
			ok(`table entry: ${person}`);
		} else {
			fail(`table entry: ${person}`, "not found in post");
		}
	}

	// ── Named people ─────────────────────────────────────────

	console.log("\nNamed people:");

	const keyPeople = [
		"Zebulon", "Eber", "Roger", "Kelly", "Steven", "Nick",
		"Justin", "Pum", "Doug", "Jebelong", "Maria", "Flora", "Peyton",
	];

	for (const person of keyPeople) {
		if (postBody.includes(person)) {
			ok(`mentions ${person}`);
		} else {
			fail(`mentions ${person}`, "name not found");
		}
	}

	// ── Scripture & prayer ───────────────────────────────────

	console.log("\nScripture & prayer:");

	const spiritualContent = [
		["Isaiah 63", "Isaiah 63"],
		["Isaiah 64", "Isaiah 64"],
		["Serenity Prayer text", "serenity to accept the things I cannot change"],
		["Niebuhr attribution", "Reinhold Niebuhr"],
	];

	for (const [name, content] of spiritualContent) {
		if (postBody.includes(content)) {
			ok(name);
		} else {
			fail(name, `"${content}" not found`);
		}
	}

	// ── Navigation ───────────────────────────────────────────

	console.log("\nNavigation:");

	if (postBody.includes('href="/posts"')) {
		ok("link to /posts");
	} else {
		fail("link to /posts", "not found");
	}

	if (postBody.includes('href="/"')) {
		ok("link to home");
	} else {
		fail("link to home", "not found");
	}

	// ── 404 for bad slug ─────────────────────────────────────

	console.log("\n404 handling:");

	const { status: notFoundStatus } = await fetchPage("/posts/this-post-does-not-exist-abc123");
	if (notFoundStatus === 404) {
		ok("nonexistent post returns 404");
	} else {
		fail("404 for bad slug", `expected 404, got ${notFoundStatus}`);
	}

	// ── Summary ──────────────────────────────────────────────

	console.log(`\n${"─".repeat(50)}`);
	console.log(`Results: ${passed} passed, ${failed} failed`);
	console.log(`${"─".repeat(50)}\n`);

	process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
	console.error("E2E script failed:", err);
	process.exit(1);
});
