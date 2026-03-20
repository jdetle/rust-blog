import {
	existsSync,
	readFileSync,
	readdirSync,
	statSync,
} from "node:fs";
import { join } from "node:path";

export type Authorship = "human" | "ai";

export interface Post {
	kind: "single";
	slug: string;
	title: string;
	date: string;
	author: string;
	authorship: Authorship;
	bodyHtml: string;
}

export interface PostVersion {
	key: string;
	label: string;
	authorship: Authorship;
	bodyHtml: string;
}

export interface PostNote {
	id: number;
	note: string;
}

export interface MultiVersionPost {
	kind: "multi";
	slug: string;
	title: string;
	date: string;
	author: string;
	authorship: Authorship;
	prompt: string;
	defaultVersion: string;
	versions: PostVersion[];
	notes: Record<string, PostNote[]>;
}

export type AnyPost = Post | MultiVersionPost;

const VERSION_LABELS: Record<string, string> = {
	slop: "AI Slop",
	original: "Original",
	human: "Human",
	ai: "AI Draft",
	grug: "Grug",
	product: "Product",
	business: "Business",
	engineering: "Engineering",
};

const VERSION_AUTHORSHIP: Record<string, Authorship> = {
	slop: "ai",
	ai: "ai",
	grug: "ai",
	product: "ai",
	business: "ai",
	engineering: "ai",
	human: "human",
};

const CONTENT_DIR = join(process.cwd(), "content", "posts");

function parseHtmlPost(filename: string): Post | null {
	const slug = filename.replace(/\.html$/, "");
	const raw = readFileSync(join(CONTENT_DIR, filename), "utf-8");

	const titleMatch = raw.match(/<title>(.*?)<\/title>/);
	const title = titleMatch ? titleMatch[1] : slug;

	const bylineMatch = raw.match(
		/<p class="byline">\s*(?:By\s+)?(.*?)\s*·\s*(.*?)\s*<\/p>/,
	);
	const author = bylineMatch ? bylineMatch[1].trim() : "John Detlefs";
	const date = bylineMatch ? bylineMatch[2].trim() : "";

	const authorshipMatch = raw.match(
		/<meta\s+name="authorship"\s+content="(human|ai)"/,
	);
	const authorship: Authorship = authorshipMatch?.[1] === "ai" ? "ai" : "human";

	const bodyMatch = raw.match(
		/<article class="article-content">([\s\S]*?)<\/article>/,
	);
	const bodyHtml = bodyMatch ? bodyMatch[1].trim() : "";

	if (!bodyHtml) return null;

	return { kind: "single", slug, title, date, author, authorship, bodyHtml };
}

function parseMultiVersionPost(dirName: string): MultiVersionPost | null {
	const dirPath = join(CONTENT_DIR, dirName);
	const manifestPath = join(dirPath, "manifest.json");

	if (!existsSync(manifestPath)) return null;

	const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

	const versionAuthorship: Record<string, Authorship> =
		manifest.authorship ?? {};

	const versions: PostVersion[] = [];
	for (const key of manifest.versions ?? []) {
		const versionPath = join(dirPath, `${key}.html`);
		if (!existsSync(versionPath)) continue;
		const bodyHtml = readFileSync(versionPath, "utf-8").trim();
		if (!bodyHtml) continue;
		versions.push({
			key,
			label: VERSION_LABELS[key] ?? key,
			authorship: versionAuthorship[key] ?? VERSION_AUTHORSHIP[key] ?? "human",
			bodyHtml,
		});
	}

	if (versions.length === 0) return null;

	let notes: Record<string, PostNote[]> = {};
	const notesPath = join(dirPath, "notes.json");
	if (existsSync(notesPath)) {
		notes = JSON.parse(readFileSync(notesPath, "utf-8"));
	}

	const defaultKey = manifest.defaultVersion ?? "original";
	const topAuthorship: Authorship =
		versionAuthorship[defaultKey] ?? VERSION_AUTHORSHIP[defaultKey] ?? "human";

	return {
		kind: "multi",
		slug: dirName,
		title: manifest.title ?? dirName,
		date: manifest.date ?? "",
		author: manifest.author ?? "John Detlefs",
		authorship: topAuthorship,
		prompt: manifest.prompt ?? "",
		defaultVersion: defaultKey,
		versions,
		notes,
	};
}

function parseDateString(dateStr: string): number {
	const d = new Date(dateStr);
	return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

export function getAllPosts(): AnyPost[] {
	const entries = readdirSync(CONTENT_DIR);

	const posts: AnyPost[] = [];

	for (const entry of entries) {
		if (entry === "index.html") continue;

		const fullPath = join(CONTENT_DIR, entry);
		const stat = statSync(fullPath);

		if (stat.isDirectory()) {
			const multi = parseMultiVersionPost(entry);
			if (multi) posts.push(multi);
		} else if (entry.endsWith(".html")) {
			const single = parseHtmlPost(entry);
			if (single && single.bodyHtml.length > 0) posts.push(single);
		}
	}

	posts.sort((a, b) => parseDateString(b.date) - parseDateString(a.date));
	return posts;
}

export function getPost(slug: string): AnyPost | null {
	const dirPath = join(CONTENT_DIR, slug);
	if (existsSync(dirPath) && statSync(dirPath).isDirectory()) {
		return parseMultiVersionPost(slug);
	}

	const filename = `${slug}.html`;
	try {
		return parseHtmlPost(filename);
	} catch {
		return null;
	}
}
