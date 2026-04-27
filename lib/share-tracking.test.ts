import { buildShareUrl, getPlatformShareUrl } from "./share-url";

describe("buildShareUrl", () => {
	it("creates a LinkedIn-ready blog post URL with UTM params", () => {
		const shareUrl = buildShareUrl({
			path: "/posts/test-post",
			platform: "linkedin",
			campaign: "post_share",
			content: "test-post",
		});

		expect(shareUrl).toBe(
			"https://jdetle.com/posts/test-post?utm_source=linkedin&utm_medium=social&utm_campaign=post_share&utm_content=test-post",
		);
	});

	it("creates a tagged URL for who-are-you", () => {
		const shareUrl = buildShareUrl({
			path: "/who-are-you",
			platform: "linkedin",
			campaign: "who_are_you_share",
			content: "who-are-you",
		});

		expect(shareUrl).toBe(
			"https://jdetle.com/who-are-you?utm_source=linkedin&utm_medium=social&utm_campaign=who_are_you_share&utm_content=who-are-you",
		);
	});
});

describe("getPlatformShareUrl", () => {
	it("passes the full tagged URL through to LinkedIn", () => {
		const utmUrl =
			"https://jdetle.com/who-are-you?utm_source=linkedin&utm_medium=social&utm_campaign=who_are_you_share&utm_content=who-are-you";

		expect(getPlatformShareUrl("linkedin", utmUrl, "Who Are You?")).toBe(
			`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(utmUrl)}`,
		);
	});
});
