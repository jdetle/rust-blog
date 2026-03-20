/**
 * Visual smoke test: screenshots every post at 3 viewports, then
 * sends each image to Claude's vision API for editorial design QA.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... bun run scripts/visual-smoke-test.ts [--base-url http://localhost:3004]
 *
 * Requires: playwright (with chromium), @anthropic-ai/sdk
 */

import { readFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import Anthropic from "@anthropic-ai/sdk";

const BASE_URL = process.argv.includes("--base-url")
	? process.argv[process.argv.indexOf("--base-url") + 1]
	: "http://localhost:3004";

const SCREENSHOT_DIR = join(process.cwd(), "screenshots");
const CONTENT_DIR = join(process.cwd(), "content", "posts");

const VIEWPORTS = [
	{ name: "desktop", width: 1280, height: 900 },
	{ name: "tablet", width: 768, height: 1024 },
	{ name: "mobile", width: 375, height: 812 },
] as const;

const REVIEW_PROMPT = `You are a senior editorial designer reviewing a blog post screenshot. 
Evaluate it against NYT/Apple editorial design standards. Be concise — 2-3 sentences max per issue.

Check for:
1. **Typography** — Is the headline rendered in a distinctive serif (Playfair Display)? Is body text readable with good line spacing? Is there a visible drop cap on the first paragraph?
2. **Hero image** — Is there a full-width hero photograph at the top? Does it have a photo credit? Is it high-quality (not pixelated or stretched)?
3. **Visual hierarchy** — Clear separation between headline, byline, and body? Proper heading sizes for h2/h3 sections?
4. **Spacing & rhythm** — Generous whitespace? Consistent margins? Content not cramped?
5. **Reading experience** — Is there a "min read" indicator? Are links visually distinct? Do blockquotes and code blocks look polished?

Rate the page: PASS (looks great), WARN (minor issues), or FAIL (significant visual problems).

Format your response as:
VERDICT: PASS|WARN|FAIL
ISSUES: (bullet list of any problems, or "None" if PASS)`;

function discoverPostSlugs(): string[] {
	if (!existsSync(CONTENT_DIR)) return [];
	return readdirSync(CONTENT_DIR, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => d.name)
		.sort();
}

async function captureScreenshots(
	slugs: string[],
): Promise<Map<string, string[]>> {
	mkdirSync(SCREENSHOT_DIR, { recursive: true });
	const results = new Map<string, string[]>();

	const browser = await chromium.launch({ headless: true });

	for (const viewport of VIEWPORTS) {
		const context = await browser.newContext({
			viewport: { width: viewport.width, height: viewport.height },
		});
		const page = await context.newPage();

		// Capture listing page
		const listingPath = join(
			SCREENSHOT_DIR,
			`listing-${viewport.name}.png`,
		);
		await page.goto(`${BASE_URL}/posts`, { waitUntil: "networkidle" });
		await page.waitForTimeout(800);
		await page.screenshot({
			path: listingPath,
			fullPage: false,
			clip: { x: 0, y: 0, width: viewport.width, height: Math.min(viewport.height * 4, 7000) },
		});

		if (!results.has("__listing__")) results.set("__listing__", []);
		results.get("__listing__")?.push(listingPath);

		// Capture each post
		for (const slug of slugs) {
			const filePath = join(
				SCREENSHOT_DIR,
				`${slug}-${viewport.name}.png`,
			);
			try {
				await page.goto(`${BASE_URL}/posts/${slug}`, {
					waitUntil: "networkidle",
					timeout: 10000,
				});
				// Wait for fonts and hero images to load
				await page.waitForTimeout(1200);
				await page.screenshot({
					path: filePath,
					fullPage: false,
					clip: { x: 0, y: 0, width: viewport.width, height: Math.min(viewport.height * 5, 7000) },
				});

				if (!results.has(slug)) results.set(slug, []);
				results.get(slug)?.push(filePath);
			} catch (err) {
				console.error(`  ✗ Failed to capture ${slug} @ ${viewport.name}: ${err}`);
			}
		}

		await context.close();
	}

	await browser.close();
	return results;
}

async function analyzeWithClaude(
	client: Anthropic,
	screenshotPaths: string[],
	label: string,
): Promise<{ verdict: string; issues: string }> {
	const images = screenshotPaths.map((p) => {
		const data = readFileSync(p).toString("base64");
		return {
			type: "image" as const,
			source: {
				type: "base64" as const,
				media_type: "image/png" as const,
				data,
			},
		};
	});

	const viewportLabels = screenshotPaths
		.map((p) => {
			if (p.includes("desktop")) return "Desktop (1280px)";
			if (p.includes("tablet")) return "Tablet (768px)";
			return "Mobile (375px)";
		})
		.join(", ");

	const response = await client.messages.create({
		model: "claude-sonnet-4-20250514",
		max_tokens: 400,
		messages: [
			{
				role: "user",
				content: [
					...images,
					{
						type: "text",
						text: `These are screenshots of the blog post "${label}" at viewports: ${viewportLabels}.\n\n${REVIEW_PROMPT}`,
					},
				],
			},
		],
	});

	const text =
		response.content[0].type === "text" ? response.content[0].text : "";
	const verdictMatch = text.match(/VERDICT:\s*(PASS|WARN|FAIL)/i);
	const issuesMatch = text.match(/ISSUES:\s*([\s\S]*)/i);

	return {
		verdict: verdictMatch?.[1]?.toUpperCase() ?? "UNKNOWN",
		issues: issuesMatch?.[1]?.trim() ?? text,
	};
}

async function main() {
	const apiKey = process.env.ANTHROPIC_API_KEY;
	if (!apiKey) {
		console.error("ANTHROPIC_API_KEY is required");
		process.exit(1);
	}

	const slugs = discoverPostSlugs();
	console.log(`\n📸 Capturing ${slugs.length} posts + listing page at 3 viewports...\n`);

	const screenshots = await captureScreenshots(slugs);
	const totalShots = Array.from(screenshots.values()).reduce(
		(n, arr) => n + arr.length,
		0,
	);
	console.log(`✓ Captured ${totalShots} screenshots\n`);

	const client = new Anthropic({ apiKey });

	// Sample strategy: review all posts but batch to stay under rate limits.
	// Review the listing page + every post's desktop screenshot for speed,
	// plus full 3-viewport review on a random sample of 5 posts.
	const allEntries = Array.from(screenshots.entries());
	const sampleSize = Math.min(5, allEntries.length);
	const sampled = new Set<string>();

	// Always review listing
	sampled.add("__listing__");

	// Pick random sample of posts for full 3-viewport review
	const postEntries = allEntries.filter(([k]) => k !== "__listing__");
	const shuffled = postEntries.sort(() => Math.random() - 0.5);
	for (let i = 0; i < sampleSize && i < shuffled.length; i++) {
		sampled.add(shuffled[i][0]);
	}

	// Review remaining posts at desktop-only
	for (const [slug] of postEntries) {
		if (!sampled.has(slug)) sampled.add(slug);
	}

	console.log("🔍 Sending screenshots to Claude for visual QA...\n");
	console.log("─".repeat(60));

	let passes = 0;
	let warns = 0;
	let fails = 0;
	const issues: Array<{ slug: string; verdict: string; detail: string }> = [];

	for (const [slug, paths] of allEntries) {
		const isFullReview =
			slug === "__listing__" || shuffled.slice(0, sampleSize).some(([s]) => s === slug);

		const reviewPaths = isFullReview
			? paths
			: paths.filter((p) => p.includes("desktop"));

		const label = slug === "__listing__" ? "Post listing page" : slug;
		const scope = isFullReview ? "3 viewports" : "desktop only";

		process.stdout.write(`  ${label} (${scope})... `);

		try {
			const result = await analyzeWithClaude(client, reviewPaths, label);

			if (result.verdict === "PASS") {
				passes++;
				console.log("✓ PASS");
			} else if (result.verdict === "WARN") {
				warns++;
				console.log("⚠ WARN");
				issues.push({
					slug,
					verdict: "WARN",
					detail: result.issues,
				});
			} else {
				fails++;
				console.log("✗ FAIL");
				issues.push({
					slug,
					verdict: "FAIL",
					detail: result.issues,
				});
			}
		} catch (err) {
			fails++;
			console.log(`✗ ERROR: ${err}`);
			issues.push({
				slug,
				verdict: "ERROR",
				detail: String(err),
			});
		}
	}

	console.log("─".repeat(60));
	console.log(
		`\n📊 Results: ${passes} PASS, ${warns} WARN, ${fails} FAIL out of ${allEntries.length} pages\n`,
	);

	if (issues.length > 0) {
		console.log("Issues found:\n");
		for (const issue of issues) {
			console.log(`  [${issue.verdict}] ${issue.slug}`);
			for (const line of issue.detail.split("\n")) {
				if (line.trim()) console.log(`    ${line.trim()}`);
			}
			console.log();
		}
	}

	// Exit with non-zero if any failures
	if (fails > 0) process.exit(1);
}

main();
