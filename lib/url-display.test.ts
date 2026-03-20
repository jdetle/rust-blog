import { describe, expect, test } from "bun:test";
import {
	absoluteEventUrl,
	formatPageLabel,
	safeDecodeUriComponent,
} from "./url-display";

describe("safeDecodeUriComponent", () => {
	test("decodes percent-encoded path segments", () => {
		expect(safeDecodeUriComponent("/posts/hello%20world")).toBe(
			"/posts/hello world",
		);
	});

	test("decodes double-encoded sequences", () => {
		expect(safeDecodeUriComponent("%252F")).toBe("/");
	});

	test("returns original on invalid escape", () => {
		expect(safeDecodeUriComponent("%")).toBe("%");
	});

	test("empty string", () => {
		expect(safeDecodeUriComponent("")).toBe("");
	});
});

describe("formatPageLabel", () => {
	test("same-origin with siteOrigin shows path only", () => {
		expect(
			formatPageLabel(
				"https://blog.example.com/posts/foo?q=1",
				"https://blog.example.com",
			),
		).toBe("/posts/foo?q=1");
	});

	test("external host shows hostname + path", () => {
		const label = formatPageLabel(
			"https://other.com/a/b",
			"https://blog.example.com",
		);
		expect(label).toBe("other.com/a/b");
	});

	test("relative path with siteOrigin", () => {
		expect(formatPageLabel("/posts/slug", "https://blog.example.com")).toBe(
			"/posts/slug",
		);
	});
});

describe("absoluteEventUrl", () => {
	test("preserves absolute URLs", () => {
		expect(absoluteEventUrl("https://a.com/x", "https://b.com")).toBe(
			"https://a.com/x",
		);
	});

	test("joins origin with path", () => {
		expect(absoluteEventUrl("/posts/foo", "https://blog.example.com")).toBe(
			"https://blog.example.com/posts/foo",
		);
	});
});
