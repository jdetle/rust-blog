import type { Metadata } from "next";
import Link from "next/link";
import { getAllPosts } from "@/lib/posts";
import { NavRow } from "@/components/nav-row";

export const metadata: Metadata = {
  title: "Posts",
  description: "Notes and essays by John Detlefs.",
};

export default function PostsPage() {
  const posts = getAllPosts();

  return (
    <main className="site-shell">
      <div className="frame article">
        <header className="list-header">
          <p className="eyebrow">Archive</p>
          <h1 className="page-title">Notes and essays</h1>
          <p className="subhead">
            Imported from Notion with a wabi-sabi editorial presentation.
          </p>
        </header>

        <ul className="post-list">
          {posts.map((post) => (
            <li key={post.slug}>
              <Link href={`/posts/${post.slug}`}>
                <span className="post-title">{post.title}</span>
                <span className="post-kicker">{post.date}</span>
              </Link>
            </li>
          ))}
        </ul>

        <NavRow
          links={[
            { href: "/", label: "Back home" },
            { href: "/who-are-you", label: "Who are you?" },
          ]}
        />
      </div>
    </main>
  );
}
