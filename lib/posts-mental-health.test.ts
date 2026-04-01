import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAllPosts, getPost, resolvePostDir } from "./posts";

const SLUG = "how-agentic-engineering-landed-me-in-a-mental-hospital";
const DIR = resolvePostDir(SLUG);
if (!DIR)
	throw new Error(
		`Post "${SLUG}" directory not found — check posts/ quarter structure`,
	);

const manifest = JSON.parse(readFileSync(join(DIR, "manifest.json"), "utf-8"));

describe("mental health post — file structure", () => {
	test("post directory exists on disk", () => {
		expect(existsSync(DIR)).toBe(true);
	});

	test("manifest.json exists", () => {
		expect(existsSync(join(DIR, "manifest.json"))).toBe(true);
	});

	test("versions/ai.html and versions/human.html exist", () => {
		expect(existsSync(join(DIR, "versions", "ai.html"))).toBe(true);
		expect(existsSync(join(DIR, "versions", "human.html"))).toBe(true);
	});

	test("slug does not contain uppercase letters", () => {
		expect(SLUG).toMatch(/^[a-z0-9-]+$/);
	});

	test("slug is under 60 characters", () => {
		expect(SLUG.length).toBeLessThanOrEqual(60);
	});
});

describe("mental health post — manifest", () => {
	test("title is correct", () => {
		expect(manifest.title).toBe(
			"How Agentic Engineering Landed Me in a Mental Hospital",
		);
	});

	test("author is John Detlefs", () => {
		expect(manifest.author).toBe("John Detlefs");
	});

	test("date is March 20, 2026", () => {
		expect(manifest.date).toBe("March 20, 2026");
	});

	test("default version is human", () => {
		expect(manifest.defaultVersion).toBe("human");
	});

	test("declares human and ai versions", () => {
		expect(manifest.versions).toContain("human");
		expect(manifest.versions).toContain("ai");
	});

	test("human version has authorship=human", () => {
		expect(manifest.authorship.human).toBe("human");
	});

	test("ai version has authorship=ai", () => {
		expect(manifest.authorship.ai).toBe("ai");
	});

	test("marked as hidden (unlisted in all environments)", () => {
		expect(manifest.hidden).toBe(true);
	});
});

describe("mental health post — hidden filtering", () => {
	test("excluded from getAllPosts()", () => {
		const all = getAllPosts();
		const found = all.find((p) => p.slug === SLUG);
		expect(found).toBeUndefined();
	});

	test("getPost() returns null", () => {
		expect(getPost(SLUG)).toBeNull();
	});
});
