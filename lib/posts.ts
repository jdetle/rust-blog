import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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

export interface HeroImage {
	url: string;
	alt: string;
	credit?: string;
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
	heroImage?: HeroImage;
	/** When true, excluded from listings and getPost in all environments (permanent unlisted). */
	hidden?: boolean;
	draft?: boolean;
}

export type AnyPost = Post | MultiVersionPost;

export interface Quarter {
	id: string;
	label: string;
	posts: AnyPost[];
}

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

const POSTS_DIR = join(process.cwd(), "posts");
const QUARTER_RE = /^\d{4}-q[1-4]$/;

const isDev = process.env.NODE_ENV === "development";

function isAiOnly(post: AnyPost): boolean {
	if (post.kind === "multi") {
		return post.versions.every((v) => v.authorship === "ai");
	}
	return post.authorship === "ai";
}

function isHiddenInProd(post: AnyPost): boolean {
	if (isDev) return false;
	if (post.kind === "multi" && post.draft) return true;
	return isAiOnly(post);
}

/** Listing and direct URL resolution — hidden posts are omitted everywhere. */
function shouldExcludePost(post: AnyPost): boolean {
	if (post.kind === "multi" && post.hidden) return true;
	return isHiddenInProd(post);
}

const QUARTER_NAMES: Record<string, string> = {
	q1: "Jan – Mar",
	q2: "Apr – Jun",
	q3: "Jul – Sep",
	q4: "Oct – Dec",
};

function quarterLabel(id: string): string {
	const [year, q] = id.split("-");
	return `${QUARTER_NAMES[q] ?? q} ${year}`;
}

function parseMultiVersionPost(
	dirPath: string,
	slug: string,
): MultiVersionPost | null {
	const manifestPath = join(dirPath, "manifest.json");
	if (!existsSync(manifestPath)) return null;

	const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
	const versionAuthorship: Record<string, Authorship> =
		manifest.authorship ?? {};

	const versionsDir = join(dirPath, "versions");
	const versions: PostVersion[] = [];
	for (const key of manifest.versions ?? []) {
		const versionPath = join(versionsDir, `${key}.html`);
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

	const heroImage: HeroImage | undefined = manifest.heroImage
		? {
				url: manifest.heroImage.url,
				alt: manifest.heroImage.alt ?? manifest.title ?? "",
				credit: manifest.heroImage.credit,
			}
		: undefined;

	return {
		kind: "multi",
		slug,
		title: manifest.title ?? slug,
		date: manifest.date ?? "",
		author: manifest.author ?? "John Detlefs",
		authorship: topAuthorship,
		prompt: manifest.prompt ?? "",
		defaultVersion: defaultKey,
		versions,
		notes,
		heroImage,
		hidden: manifest.hidden === true ? true : undefined,
		draft: manifest.draft === true ? true : undefined,
	};
}

export function estimateReadingTime(html: string): number {
	const text = html
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	const words = text.split(" ").length;
	return Math.max(1, Math.ceil(words / 230));
}

function parseDateString(dateStr: string): number {
	const d = new Date(dateStr);
	return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function scanQuarterDir(quarterDir: string): AnyPost[] {
	if (!existsSync(quarterDir)) return [];
	const posts: AnyPost[] = [];
	for (const entry of readdirSync(quarterDir)) {
		const fullPath = join(quarterDir, entry);
		if (!statSync(fullPath).isDirectory()) continue;
		const post = parseMultiVersionPost(fullPath, entry);
		if (post && !shouldExcludePost(post)) posts.push(post);
	}
	posts.sort((a, b) => parseDateString(b.date) - parseDateString(a.date));
	return posts;
}

export function getAllQuarters(): Quarter[] {
	const entries = readdirSync(POSTS_DIR).filter(
		(e) => QUARTER_RE.test(e) && statSync(join(POSTS_DIR, e)).isDirectory(),
	);
	entries.sort().reverse();

	const quarters: Quarter[] = [];
	for (const id of entries) {
		const posts = scanQuarterDir(join(POSTS_DIR, id));
		if (posts.length > 0) {
			quarters.push({ id, label: quarterLabel(id), posts });
		}
	}
	return quarters;
}

export function getAllPosts(): AnyPost[] {
	return getAllQuarters().flatMap((q) => q.posts);
}

export function resolvePostDir(slug: string): string | null {
	const entries = readdirSync(POSTS_DIR).filter(
		(e) => QUARTER_RE.test(e) && statSync(join(POSTS_DIR, e)).isDirectory(),
	);

	for (const quarter of entries) {
		const dirPath = join(POSTS_DIR, quarter, slug);
		if (existsSync(dirPath) && statSync(dirPath).isDirectory()) {
			return dirPath;
		}
	}
	return null;
}

export function resolvePostPath(slug: string, subpath: string): string | null {
	const dir = resolvePostDir(slug);
	if (!dir) return null;
	const full = join(dir, subpath);
	return existsSync(full) ? full : null;
}

export function getPost(slug: string): AnyPost | null {
	const dirPath = resolvePostDir(slug);
	if (!dirPath) return null;
	const post = parseMultiVersionPost(dirPath, slug);
	if (post && shouldExcludePost(post)) return null;
	return post;
}
