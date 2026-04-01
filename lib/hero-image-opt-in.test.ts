import { describe, expect, test } from "bun:test";
import { getPost } from "./posts";

describe("hero image manifest opt-in", () => {
	test("multi-version post omits heroImage unless manifest has showHeroImage: true", () => {
		const post = getPost("rules-that-make-quality-sites-easy");
		expect(post?.kind).toBe("multi");
		if (post?.kind === "multi") {
			expect(post.heroImage).toBeUndefined();
		}
	});
});
