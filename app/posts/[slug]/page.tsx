import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AnimatedFrame } from "@/components/animated-frame";
import { AuthorshipBadge } from "@/components/authorship-badge";
import { MultiVersionBody } from "@/components/multi-version-body";
import { NavRow } from "@/components/nav-row";
import { PostReadTracker } from "@/components/post-read-tracker";
import { ShareBar } from "@/components/share-bar";
import { getAllPosts, getPost } from "@/lib/posts";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://jdetle.com";

export function generateStaticParams() {
	return getAllPosts().map((p) => ({ slug: p.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { slug } = await params;
	const post = getPost(slug);
	if (!post) return { title: "Not found" };

	const postUrl = `${SITE_URL}/posts/${slug}`;
	const description = `${post.title} by ${post.author}`;

	return {
		title: post.title,
		description,
		openGraph: {
			title: post.title,
			description,
			url: postUrl,
			type: "article",
			siteName: "John Detlefs",
			authors: post.author ? [post.author] : undefined,
		},
		twitter: {
			card: "summary",
			title: post.title,
			description,
		},
		alternates: {
			canonical: postUrl,
		},
	};
}

export default async function PostPage({ params }: Props) {
	const { slug } = await params;
	const post = getPost(slug);
	if (!post) notFound();

	const isMulti = post.kind === "multi";

	return (
		<main className="site-shell">
			<AnimatedFrame className={isMulti ? "" : "article"}>
				<header className="list-header">
					<p className="eyebrow">Essay</p>
					<h1 className="page-title">{post.title}</h1>
					{(post.author || post.date) && (
						<p className="byline">
							{post.author && <>By {post.author}</>}
							{post.author && post.date && <> &middot; </>}
							{post.date}
							{!isMulti && (
								<AuthorshipBadge authorship={post.authorship} />
							)}
						</p>
					)}
				</header>

				{isMulti ? (
					<Suspense fallback={null}>
						<MultiVersionBody post={post} />
					</Suspense>
				) : (
					<article
						className="article-content"
						// biome-ignore lint/security/noDangerouslySetInnerHtml: post body from trusted content/posts HTML files
						dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
					/>
				)}

				<PostReadTracker slug={slug} title={post.title} />
				<ShareBar slug={slug} title={post.title} />
				<NavRow />
			</AnimatedFrame>
		</main>
	);
}
