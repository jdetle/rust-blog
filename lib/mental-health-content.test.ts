import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FILE = join(
	process.cwd(),
	"content",
	"posts",
	"how-prompt-engineering-landed-me-in-a-mental-hospital.html",
);
const html = readFileSync(FILE, "utf-8");

describe("mental health post — HTML structure", () => {
	test("has doctype", () => {
		expect(html).toMatch(/^<!doctype html>/i);
	});

	test("has lang attribute", () => {
		expect(html).toContain('<html lang="en">');
	});

	test("has viewport meta tag", () => {
		expect(html).toContain(
			'<meta name="viewport" content="width=device-width, initial-scale=1">',
		);
	});

	test("links blog.css stylesheet", () => {
		expect(html).toContain('<link rel="stylesheet" href="/posts/blog.css">');
	});

	test("has site-shell wrapper", () => {
		expect(html).toContain('class="site-shell"');
	});

	test("has frame article wrapper", () => {
		expect(html).toContain('class="frame article"');
	});

	test("has list-header", () => {
		expect(html).toContain('class="list-header"');
	});

	test("has eyebrow label", () => {
		expect(html).toContain('class="eyebrow"');
	});

	test("has page-title", () => {
		expect(html).toContain('class="page-title"');
	});

	test("has byline", () => {
		expect(html).toContain('class="byline"');
	});

	test("has article-content", () => {
		expect(html).toContain('class="article-content"');
	});

	test("has nav-row with links", () => {
		expect(html).toContain('class="nav-row"');
		expect(html).toContain('href="/posts"');
		expect(html).toContain('href="/"');
	});

	test("includes analytics script", () => {
		expect(html).toContain('src="/posts/analytics.js"');
	});
});

describe("mental health post — narrative sections (DAG order)", () => {
	const sectionHeadings = [
		"The Perfect Storm",
		"February 27 — Voluntary Admission",
		"February 28 — The Day That Broke Trust",
		"March 1 — Sunday",
		"March 3 — Monday: The Lowest Point",
		"March 5 — The Hearing",
		"March 5 – March 9 — Stabilization",
		"March 9 — Discharge",
		"What I'm Still Working On",
		"Accountability",
		"The Serenity Prayer",
		"In Repair",
	];

	for (const heading of sectionHeadings) {
		test(`has section: "${heading}"`, () => {
			expect(html).toContain(heading);
		});
	}

	test("sections appear in DAG-prescribed order", () => {
		const positions = sectionHeadings.map((h) => html.indexOf(h));
		for (let i = 1; i < positions.length; i++) {
			expect(positions[i]).toBeGreaterThan(positions[i - 1]!);
		}
	});

	test("opens in medias res (Monday March 3 before backstory)", () => {
		const mondayPos = html.indexOf("Monday, March 3");
		const perfectStormPos = html.indexOf("The Perfect Storm");
		expect(mondayPos).toBeGreaterThan(-1);
		expect(perfectStormPos).toBeGreaterThan(-1);
		expect(mondayPos).toBeLessThan(perfectStormPos);
	});
});

describe("mental health post — interactive overlays (details elements)", () => {
	const overlays = [
		"Hypomania vs. Mania",
		"Texas Patient Bill of Rights",
		"Where I should have been",
		"The OCEAN System",
		"Filing a TMB Complaint",
	];

	for (const overlay of overlays) {
		test(`has expandable overlay: "${overlay}"`, () => {
			expect(html).toContain(`<summary>${overlay}`);
		});
	}

	test("all overlays have overlay-content divs", () => {
		const detailsCount = (html.match(/<details>/g) || []).length;
		const overlayDivCount = (html.match(/class="overlay-content"/g) || [])
			.length;
		expect(detailsCount).toBe(overlayDivCount);
		expect(detailsCount).toBe(5);
	});

	test("overlays have closing tags", () => {
		const openCount = (html.match(/<details>/g) || []).length;
		const closeCount = (html.match(/<\/details>/g) || []).length;
		expect(openCount).toBe(closeCount);
	});
});

describe("mental health post — named people (from DAG)", () => {
	const namedPeople = {
		patients: ["Kelly", "Steven", "Nick", "Roger"],
		positiveTechs: ["Pum", "Justin", "Doug", "Jebelong", "Maria", "Flora", "Peyton"],
		accountable: ["Farruggi", "Bennett", "Cunningham", "David"],
		acknowledged: ["Zebulon", "Eber"],
	};

	for (const [group, names] of Object.entries(namedPeople)) {
		for (const name of names) {
			test(`mentions ${name} (${group})`, () => {
				expect(html).toContain(name);
			});
		}
	}
});

describe("mental health post — accountability table", () => {
	test("has an accountability table", () => {
		expect(html).toContain('class="accountability-table"');
	});

	test("table has header row (Person, Role, Action)", () => {
		expect(html).toContain("<th>Person</th>");
		expect(html).toContain("<th>Role</th>");
		expect(html).toContain("<th>Action</th>");
	});

	const rows = [
		{ person: "Dr. Farruggi", role: "Physician" },
		{ person: "Richard Bennett", role: "CEO, Austin Oaks" },
		{ person: "Sam Cunningham", role: "Dir. of Clinical Services" },
		{ person: "David", role: "Charge Nurse" },
		{ person: "Austin Oaks / UHS", role: "NYSE: UHS" },
	];

	for (const row of rows) {
		test(`table includes ${row.person}`, () => {
			expect(html).toContain(`<td>${row.person}</td>`);
			expect(html).toContain(`<td>${row.role}</td>`);
		});
	}
});

describe("mental health post — scripture and prayer", () => {
	test("contains Isaiah 63 reference", () => {
		expect(html).toContain("Isaiah 63");
	});

	test("contains Isaiah 64 reference", () => {
		expect(html).toContain("Isaiah 64");
	});

	test("contains full Serenity Prayer", () => {
		expect(html).toContain("serenity to accept the things I cannot change");
		expect(html).toContain("courage to change the things I can");
		expect(html).toContain("wisdom to know the difference");
	});

	test("Serenity Prayer is attributed to Reinhold Niebuhr", () => {
		expect(html).toContain("Reinhold Niebuhr");
	});

	test("pull quotes use the pull-quote class", () => {
		const pullQuoteCount = (html.match(/class="pull-quote"/g) || []).length;
		expect(pullQuoteCount).toBeGreaterThanOrEqual(3);
	});
});

describe("mental health post — YouTube embed", () => {
	test("has a video embed container", () => {
		expect(html).toContain('class="video-embed"');
	});

	test("embeds the correct video (In Repair by John Mayer)", () => {
		expect(html).toContain("youtube.com/embed/LJS7Igvk6ZM");
	});

	test("iframe has accessible title", () => {
		expect(html).toMatch(/iframe[\s\S]*?title="[^"]+"/);
	});

	test("iframe uses lazy loading", () => {
		expect(html).toContain('loading="lazy"');
	});

	test("iframe allows fullscreen", () => {
		expect(html).toContain("allowfullscreen");
	});
});

describe("mental health post — timeline markers", () => {
	const markers = [
		"Monday, March 3",
		"Thursday, 8:00 PM",
		"10:00 PM",
		"~11:00 PM",
		"1:00 AM",
		"3:00 AM",
		"6:00 AM",
		"7:02 AM",
		"Saturday Evening",
		"Saturday Night",
		"5:00 - 7:00 PM",
	];

	for (const marker of markers) {
		test(`has timeline marker: "${marker}"`, () => {
			expect(html).toContain(marker);
		});
	}

	test("timeline markers use the timeline-marker class", () => {
		const count = (html.match(/class="timeline-marker"/g) || []).length;
		expect(count).toBeGreaterThanOrEqual(9);
	});
});

describe("mental health post — key narrative beats", () => {
	test("acknowledges driving Zebulon to tears", () => {
		expect(html).toContain("drove that man to tears");
	});

	test("contains direct apology to Zebulon", () => {
		expect(html).toContain("I'm sorry, Zebulon");
	});

	test("acknowledges threats as own fault", () => {
		expect(html).toContain("I made threats");
	});

	test("discusses the CALM CALM moment", () => {
		expect(html).toContain("CALM, CALM");
	});

	test("mentions tattoo plan", () => {
		expect(html).toContain("tattoo");
	});

	test("mentions chose restraint / didn't fight back", () => {
		expect(html).toContain("didn't fight back");
	});

	test("acknowledges family's fear as valid", () => {
		expect(html).toContain("fear was completely valid");
	});

	test("acknowledges substance use as avoidance", () => {
		expect(html).toContain("using substances to avoid confronting reality");
	});

	test("discusses hypomania vs 2017 manic episode", () => {
		expect(html).toContain("2017");
	});

	test("mentions sleep medication left at in-laws", () => {
		expect(html).toContain("in-laws");
	});

	test("mentions quitting weed", () => {
		expect(html).toContain("quit weed");
	});

	test("mentions Haldol as eventual correct medication", () => {
		expect(html).toContain("Haldol");
	});

	test("discusses wrong level of care (Austin Oaks vs Dell Seton)", () => {
		expect(html).toContain("Dell Seton");
		expect(html).toContain("Austin Oaks");
	});

	test("mentions UHS as corporate owner", () => {
		expect(html).toContain("Universal Health Services");
		expect(html).toContain("NYSE: UHS");
	});

	test("discusses brother testifying", () => {
		expect(html).toContain("brother testified against me");
	});

	test("ends with 'not together but getting there'", () => {
		expect(html).toContain("not together but I'm getting there");
	});

	test("frames ending as beginning, not conclusion", () => {
		expect(html).toContain("This is a beginning. Not a conclusion.");
	});

	test("discusses DBT", () => {
		expect(html).toContain("Dialectical Behavior Therapy");
	});

	test("discusses SMART goals", () => {
		expect(html).toContain("Specific, Measurable, Achievable, Relevant, Time-bound");
	});

	test("mentions prompt engineering in the backstory", () => {
		expect(html).toContain("prompt engineering");
	});

	test("discusses 56+ hour physician gap", () => {
		expect(html).toContain("56+");
	});

	test("references Texas Health and Safety Code § 576.023", () => {
		expect(html).toContain("576.023");
	});

	test("mentions HIPAA violation by Eber", () => {
		expect(html).toContain("HIPAA");
	});

	test("acknowledges own behavior at intake as cruelty", () => {
		expect(html).toContain("cruelty wearing a righteous mask");
	});

	test("not framed as hero story", () => {
		expect(html).toContain(
			"This is not a story where I'm the hero",
		);
	});

	test("Justin's 'thug it out' quote preserved", () => {
		expect(html).toContain("thug it out");
	});

	test("acknowledges understaffing (30 patients, 3 nurses)", () => {
		expect(html).toContain("30 patients");
	});
});

describe("mental health post — CSS custom styles", () => {
	test("defines details element styling", () => {
		expect(html).toContain("details {");
	});

	test("defines pull-quote styling", () => {
		expect(html).toContain(".pull-quote {");
	});

	test("defines accountability-table styling", () => {
		expect(html).toContain(".accountability-table {");
	});

	test("defines video-embed responsive styling", () => {
		expect(html).toContain(".video-embed {");
		expect(html).toContain("padding-bottom: 56.25%");
	});

	test("defines timeline-marker styling", () => {
		expect(html).toContain(".timeline-marker {");
	});

	test("hides default details marker", () => {
		expect(html).toContain("::-webkit-details-marker");
	});
});
