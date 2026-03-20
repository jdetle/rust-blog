import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAllPosts, getPost } from "./posts";

const SLUG = "how-prompt-engineering-landed-me-in-a-mental-hospital";
const FILE = join(
	process.cwd(),
	"content",
	"posts",
	`${SLUG}.html`,
);

describe("mental health post — discovery & parsing", () => {
	test("post file exists on disk", () => {
		const raw = readFileSync(FILE, "utf-8");
		expect(raw.length).toBeGreaterThan(0);
	});

	test("getAllPosts() includes this post", () => {
		const all = getAllPosts();
		const found = all.find((p) => p.slug === SLUG);
		expect(found).toBeDefined();
	});

	test("getPost() retrieves by slug", () => {
		const post = getPost(SLUG);
		expect(post).not.toBeNull();
	});

	test("kind is single (not multi-version)", () => {
		const post = getPost(SLUG);
		expect(post?.kind).toBe("single");
	});

	test("title is parsed correctly", () => {
		const post = getPost(SLUG);
		expect(post?.title).toBe(
			"How Prompt Engineering Landed Me in a Mental Hospital",
		);
	});

	test("author is John Detlefs", () => {
		const post = getPost(SLUG);
		expect(post?.author).toBe("John Detlefs");
	});

	test("date is March 20, 2026", () => {
		const post = getPost(SLUG);
		expect(post?.date).toBe("March 20, 2026");
	});

	test("bodyHtml is non-empty", () => {
		const post = getPost(SLUG);
		expect(post).not.toBeNull();
		if (post?.kind === "single") {
			expect(post.bodyHtml.length).toBeGreaterThan(1000);
		}
	});

	test("post sorts as most recent in listing", () => {
		const all = getAllPosts();
		expect(all[0]?.slug).toBe(SLUG);
	});

	test("slug does not contain uppercase letters", () => {
		expect(SLUG).toMatch(/^[a-z0-9-]+$/);
	});

	test("slug is under 60 characters", () => {
		expect(SLUG.length).toBeLessThanOrEqual(60);
	});
});
