import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getAllPosts, getPost } from "./posts";

const SLUG = "how-prompt-engineering-landed-me-in-a-mental-hospital";
const DIR = join(process.cwd(), "content", "posts", SLUG);

describe("mental health post — discovery & parsing", () => {
	test("post directory exists on disk", () => {
		expect(existsSync(DIR)).toBe(true);
	});

	test("manifest.json exists", () => {
		expect(existsSync(join(DIR, "manifest.json"))).toBe(true);
	});

	test("ai.html and human.html exist", () => {
		expect(existsSync(join(DIR, "ai.html"))).toBe(true);
		expect(existsSync(join(DIR, "human.html"))).toBe(true);
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

	test("kind is multi (multi-version)", () => {
		const post = getPost(SLUG);
		expect(post?.kind).toBe("multi");
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

	test("has human and ai versions", () => {
		const post = getPost(SLUG);
		expect(post).not.toBeNull();
		if (post?.kind === "multi") {
			const keys = post.versions.map((v) => v.key);
			expect(keys).toContain("human");
			expect(keys).toContain("ai");
		}
	});

	test("default version is human", () => {
		const post = getPost(SLUG);
		if (post?.kind === "multi") {
			expect(post.defaultVersion).toBe("human");
		}
	});

	test("human version has authorship=human", () => {
		const post = getPost(SLUG);
		if (post?.kind === "multi") {
			const human = post.versions.find((v) => v.key === "human");
			expect(human?.authorship).toBe("human");
		}
	});

	test("ai version has authorship=ai", () => {
		const post = getPost(SLUG);
		if (post?.kind === "multi") {
			const ai = post.versions.find((v) => v.key === "ai");
			expect(ai?.authorship).toBe("ai");
		}
	});

	test("top-level authorship matches default version (human)", () => {
		const post = getPost(SLUG);
		expect(post?.authorship).toBe("human");
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
