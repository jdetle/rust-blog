import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface Post {
  slug: string;
  title: string;
  date: string;
  author: string;
  bodyHtml: string;
}

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

  const bodyMatch = raw.match(
    /<article class="article-content">([\s\S]*?)<\/article>/,
  );
  const bodyHtml = bodyMatch ? bodyMatch[1].trim() : "";

  if (!bodyHtml) return null;

  return { slug, title, date, author, bodyHtml };
}

function parseDateString(dateStr: string): number {
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

export function getAllPosts(): Post[] {
  const files = readdirSync(CONTENT_DIR).filter(
    (f) => f.endsWith(".html") && f !== "index.html",
  );
  const posts = files
    .map(parseHtmlPost)
    .filter((p): p is Post => p !== null && p.bodyHtml.length > 0);

  posts.sort((a, b) => parseDateString(b.date) - parseDateString(a.date));
  return posts;
}

export function getPost(slug: string): Post | null {
  const filename = `${slug}.html`;
  try {
    return parseHtmlPost(filename);
  } catch {
    return null;
  }
}
