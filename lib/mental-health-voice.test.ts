import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const AI_FILE = join(
	process.cwd(),
	"content",
	"posts",
	"how-agentic-engineering-landed-me-in-a-mental-hospital",
	"versions",
	"ai.html",
);
const body = readFileSync(AI_FILE, "utf-8");

describe("mental health post — banned AI phrases (blog-voice.mdc)", () => {
	const bannedPhrases = [
		"The uncomfortable truth",
		"It's important to note that",
		"In today's fast-paced world",
		"In the realm of",
		"At the end of the day",
		"commodity analytics tooling",
		"delve",
		"leverage",
		"tapestry",
		"landscape",
		"robust",
		"comprehensive",
		"nuanced",
		"paradigm",
		"synergy",
		"holistic",
	];

	for (const phrase of bannedPhrases) {
		test(`does not contain banned phrase: "${phrase}"`, () => {
			expect(body.toLowerCase()).not.toContain(phrase.toLowerCase());
		});
	}
});

describe("mental health post — banned structural patterns", () => {
	test("does not use 'It's not X — it's Y' pattern", () => {
		expect(body).not.toMatch(
			/It['']s not .{3,40}\s*[—–-]\s*it['']s/i,
		);
	});

	test("does not use 'The problem isn't X. The problem is Y.' pattern", () => {
		expect(body).not.toMatch(
			/The problem isn['']t .{3,40}\.\s*The problem is/i,
		);
	});

	test("does not use 'Not X. Not Y. Just Z.' dramatic countdown", () => {
		expect(body).not.toMatch(/Not \w+\.\s*Not \w+\.\s*Just \w+\./);
	});

	test("does not use bold-keyword formatted lists", () => {
		const boldDescriptionPattern =
			/<p>\s*<strong>[^<]+<\/strong>\.\s+[A-Z]/g;
		const matches = body.match(boldDescriptionPattern) || [];
		expect(matches.length).toBeLessThan(3);
	});
});

describe("mental health post — tone markers (humility & contrition)", () => {
	test("uses first person throughout", () => {
		const iCount = (body.match(/\bI\b/g) || []).length;
		expect(iCount).toBeGreaterThan(50);
	});

	test("contains self-deprecating admissions", () => {
		const markers = [
			"I put myself here",
			"my own fault",
			"I need to own",
			"I need to be honest",
		];
		const found = markers.filter((m) => body.includes(m));
		expect(found.length).toBeGreaterThanOrEqual(2);
	});

	test("uses contractions (casual voice)", () => {
		const contractions = ["I'm", "didn't", "couldn't", "wasn't", "don't", "isn't", "I'd"];
		const found = contractions.filter((c) => body.includes(c));
		expect(found.length).toBeGreaterThanOrEqual(5);
	});

	test("has varied paragraph lengths (not uniform)", () => {
		const paragraphs = body
			.split(/<\/p>/)
			.map((p) => p.replace(/<[^>]+>/g, "").trim())
			.filter((p) => p.length > 20);

		const lengths = paragraphs.map((p) => p.length);
		const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
		const variance =
			lengths.reduce((sum, l) => sum + (l - avg) ** 2, 0) / lengths.length;
		const stdDev = Math.sqrt(variance);

		expect(stdDev).toBeGreaterThan(50);
	});

	test("has short punchy sentences mixed with long ones", () => {
		const textOnly = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
		const sentences = textOnly
			.split(/[.!?]+/)
			.map((s) => s.trim())
			.filter((s) => s.length > 0);

		const shortSentences = sentences.filter((s) => s.split(" ").length <= 6);
		const longSentences = sentences.filter((s) => s.split(" ").length >= 20);

		expect(shortSentences.length).toBeGreaterThan(5);
		expect(longSentences.length).toBeGreaterThan(5);
	});

	test("contains parenthetical asides (not em dashes)", () => {
		const parentheticals = (body.match(/\([^)]+\)/g) || []).length;
		expect(parentheticals).toBeGreaterThan(3);
	});

	test("does not have a clean AI-style sign-off", () => {
		const aiSignoffs = [
			"hopefully this",
			"I hope this post",
			"thanks for reading",
			"if you found this helpful",
			"feel free to reach out",
			"let me know in the comments",
		];
		for (const signoff of aiSignoffs) {
			expect(body.toLowerCase()).not.toContain(signoff);
		}
	});

	test("opens with a specific scene, not a thesis statement", () => {
		const firstParagraph = body
			.match(/<p>([\s\S]*?)<\/p>/)?.[1]
			?.replace(/<[^>]+>/g, "")
			.trim();
		expect(firstParagraph).toBeDefined();
		expect(firstParagraph).toContain("Monday");
	});
});

describe("mental health post — factual consistency with DAG", () => {
	test("11-day stay (Feb 27 → Mar 9)", () => {
		expect(body).toContain("Eleven days");
	});

	test("voluntary admission", () => {
		expect(body).toContain("Voluntarily");
	});

	test("Roger described as nonverbal, schizophrenic", () => {
		expect(body).toContain("nonverbal");
		expect(body).toContain("schizophrenic");
	});

	test("Roger's size mentioned (~350 lbs)", () => {
		expect(body).toContain("350");
	});

	test("six-hour wait in waiting room", () => {
		expect(body).toContain("six hours");
	});

	test("Dell Seton address (1500 Red River St)", () => {
		expect(body).toContain("1500 Red River");
	});

	test("Austin Oaks address (1407 West Stassney)", () => {
		expect(body).toContain("1407 West Stassney");
	});

	test("Austin Oaks is 80-bed facility", () => {
		expect(body).toContain("80-bed");
	});

	test("TMB phone number preserved", () => {
		expect(body).toContain("800-201-9353");
	});

	test("TMB website preserved", () => {
		expect(body).toContain("tmb.state.tx.us");
	});

	test("held through Monday March 9", () => {
		expect(body).toContain("March 9");
	});

	test("Farruggi evaluation at 7:02 AM", () => {
		expect(body).toContain("7:02 AM");
	});

	test("handcuffed for transport only (not inside hospital)", () => {
		expect(body).toContain("handcuffed for transport");
		expect(body).toContain("not inside the hospital");
	});
});
