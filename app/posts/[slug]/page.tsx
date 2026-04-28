import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AnimatedFrame } from "@/components/animated-frame";
import { AuthorshipBadge } from "@/components/authorship-badge";
import { HeroImage } from "@/components/hero-image";
import { MultiVersionBody } from "@/components/multi-version-body";
import { NavRow } from "@/components/nav-row";
import { PostReadTracker } from "@/components/post-read-tracker";
import { ReadingProgress } from "@/components/reading-progress";
import { ShareBar } from "@/components/share-bar";
import { estimateReadingTime, getAllPosts, getPost } from "@/lib/posts";

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
	const heroImage = isMulti ? post.heroImage : undefined;

	const bodyHtml = isMulti
		? (post.versions.find((v) => v.key === post.defaultVersion)?.bodyHtml ?? "")
		: post.bodyHtml;
	const readTime = estimateReadingTime(bodyHtml);

	return (
		<>
			<ReadingProgress />
			<main className="site-shell">
				<AnimatedFrame className={isMulti ? "" : "article"}>
					{heroImage && <HeroImage hero={heroImage} />}

					<header className="list-header">
						<p className="eyebrow">Essay</p>
						<h1 className="page-title">{post.title}</h1>
						{(post.author || post.date) && (
							<p className="byline">
								{post.author && <>By {post.author}</>}
								{post.author && post.date && <> &middot; </>}
								{post.date}
								{post.date && <> &middot; </>}
								<span className="reading-time">{readTime} min read</span>
								{!isMulti && <AuthorshipBadge authorship={post.authorship} />}
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
							// biome-ignore lint/security/noDangerouslySetInnerHtml: post body from trusted posts/ HTML files
							dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
						/>
					)}

					<PostReadTracker slug={slug} title={post.title} />
					<ShareBar path={`/posts/${slug}`} slug={slug} title={post.title} />
					<NavRow />
				</AnimatedFrame>
			</main>
		</>
	);
}
