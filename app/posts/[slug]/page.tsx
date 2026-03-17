import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllPosts, getPost } from "@/lib/posts";
import { NavRow } from "@/components/nav-row";

export function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return { title: "Not found" };
  return {
    title: post.title,
    description: `${post.title} by ${post.author}`,
  };
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  return (
    <main className="site-shell">
      <div className="frame article">
        <header className="list-header">
          <p className="eyebrow">Essay</p>
          <h1 className="page-title">{post.title}</h1>
          {(post.author || post.date) && (
            <p className="byline">
              {post.author && <>By {post.author}</>}
              {post.author && post.date && <> &middot; </>}
              {post.date}
            </p>
          )}
        </header>

        <article
          className="article-content"
          dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
        />

        <NavRow />
      </div>
    </main>
  );
}
