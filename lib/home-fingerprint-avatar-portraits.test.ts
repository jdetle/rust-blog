import { describe, expect, test } from "bun:test";
import {
	isAvatarPngDataUri,
	mergePortraitUrisNewestFirst,
	portraitDataUrisFromAvatarPayload,
} from "./home-fingerprint-avatar-portraits";

const PNG = "data:image/png;base64,AAA";

describe("portraitDataUrisFromAvatarPayload", () => {
	test("returns every entry in avatar_urls in order (newest-first from server)", () => {
		const uris = [PNG, `${PNG}2`, `${PNG}3`];
		expect(
			portraitDataUrisFromAvatarPayload({
				avatar_urls: uris,
				avatar_url: "ignored-when-array-present",
			}),
		).toEqual(uris);
	});

	test("filters non-strings and invalid prefixes but keeps all valid PNG data URIs", () => {
		expect(
			portraitDataUrisFromAvatarPayload({
				avatar_urls: [PNG, null, 1, "data:image/jpeg;base64,xx", PNG, ""],
				avatar_url: null,
			}),
		).toEqual([PNG, PNG]);
	});

	test("falls back to avatar_url when avatar_urls missing or empty", () => {
		expect(
			portraitDataUrisFromAvatarPayload({
				avatar_url: PNG,
			}),
		).toEqual([PNG]);
		expect(
			portraitDataUrisFromAvatarPayload({
				avatar_urls: [],
				avatar_url: PNG,
			}),
		).toEqual([PNG]);
	});

	test("returns empty when nothing valid", () => {
		expect(portraitDataUrisFromAvatarPayload({})).toEqual([]);
		expect(
			portraitDataUrisFromAvatarPayload({
				avatar_urls: ["http://x"],
				avatar_url: null,
			}),
		).toEqual([]);
	});

	test("ignores extra payload fields (e.g. avatar_history_len) — only avatar_urls/avatar_url matter", () => {
		const uris = [PNG, `${PNG}b`];
		const payload = Object.assign(
			{ avatar_history_len: 99, other: 1 },
			{ avatar_urls: uris, avatar_url: "ignored" },
		) as { avatar_urls?: unknown; avatar_url?: unknown };
		expect(portraitDataUrisFromAvatarPayload(payload)).toEqual(uris);
	});
});

describe("mergePortraitUrisNewestFirst", () => {
	test("keeps server order first, appends local-only", () => {
		const a = `${PNG}A`;
		const b = `${PNG}B`;
		const c = `${PNG}C`;
		expect(mergePortraitUrisNewestFirst([a, b], [c, a])).toEqual([a, b, c]);
	});
	test("dedupes identical URIs with server first", () => {
		const a = `${PNG}X`;
		expect(mergePortraitUrisNewestFirst([a], [a, `${PNG}Y`])).toEqual([a, `${PNG}Y`]);
	});
});

describe("isAvatarPngDataUri", () => {
	test("accepts standard PNG data URIs", () => {
		expect(isAvatarPngDataUri(PNG)).toBe(true);
		expect(isAvatarPngDataUri("data:image/png;base64,")).toBe(true);
	});

	test("rejects other schemes", () => {
		expect(isAvatarPngDataUri("data:image/webp;base64,xx")).toBe(false);
		expect(isAvatarPngDataUri("https://x")).toBe(false);
	});
});
