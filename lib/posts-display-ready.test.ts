import { describe, expect, test } from "bun:test";
import {
	type AnyPost,
	DISPLAY_READY_MIN_WORDS,
	getAllPosts,
	getRecentPosts,
	isDisplayReady,
	type MultiVersionPost,
} from "./posts";

function stubMulti(
	slug: string,
	humanBody: string,
	aiBody = "<p>AI draft.</p>",
): MultiVersionPost {
	return {
		kind: "multi",
		slug,
		title: slug,
		date: "March 15, 2026",
		author: "John Detlefs",
		authorship: "human",
		prompt: "",
		defaultVersion: "human",
		versions: [
			{
				key: "human",
				label: "Human",
				authorship: "human",
				bodyHtml: humanBody,
			},
			{ key: "ai", label: "AI Draft", authorship: "ai", bodyHtml: aiBody },
		],
		notes: {},
	};
}

describe("isDisplayReady", () => {
	test("returns false for a placeholder-length body", () => {
		const post = stubMulti(
			"placeholder",
			"<p>Placeholder for the human-reviewed version.</p>",
		);
		expect(isDisplayReady(post)).toBe(false);
	});

	test("returns false for a one-sentence draft body", () => {
		const post = stubMulti(
			"draft",
			"<p>Starting this off with the caveat that this is very short.</p>",
		);
		expect(isDisplayReady(post)).toBe(false);
	});

	test("returns true once body clears the minimum word threshold", () => {
		const filler = Array.from(
			{ length: DISPLAY_READY_MIN_WORDS + 20 },
			(_, i) => `word${i}`,
		).join(" ");
		const post = stubMulti("ready", `<p>${filler}</p>`);
		expect(isDisplayReady(post)).toBe(true);
	});

	test("ignores HTML tags when counting words", () => {
		const visible = Array.from(
			{ length: DISPLAY_READY_MIN_WORDS - 10 },
			(_, i) => `word${i}`,
		).join(" ");
		const post = stubMulti(
			"tags-only",
			`<div><section><article>${visible}</article></section></div>`,
		);
		expect(isDisplayReady(post)).toBe(false);
	});

	test("handles empty body", () => {
		const post = stubMulti("empty", "");
		expect(isDisplayReady(post)).toBe(false);
	});
});

describe("getRecentPosts lead-slot hygiene", () => {
	test("every returned post satisfies isDisplayReady", () => {
		const recent = getRecentPosts(10);
		for (const post of recent) {
			expect(isDisplayReady(post)).toBe(true);
		}
	});

	test("does not surface an in-progress post as the home lead", () => {
		const recent = getRecentPosts(1);
		if (recent.length === 0) return;
		const lead = recent[0] as AnyPost;
		expect(isDisplayReady(lead)).toBe(true);
	});

	test("posts failing the threshold remain in the full archive", () => {
		const all = getAllPosts();
		const recentSlugs = new Set(getRecentPosts(all.length).map((p) => p.slug));
		const suppressed = all.filter((p) => !recentSlugs.has(p.slug));
		for (const post of suppressed) {
			expect(isDisplayReady(post)).toBe(false);
		}
	});
});
