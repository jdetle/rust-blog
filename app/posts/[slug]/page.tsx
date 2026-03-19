import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AnimatedFrame } from "@/components/animated-frame";
import { NavRow } from "@/components/nav-row";
import { PostReadTracker } from "@/components/post-read-tracker";
import { getAllPosts, getPost } from "@/lib/posts";

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
			<AnimatedFrame className="article">
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
					// biome-ignore lint/security/noDangerouslySetInnerHtml: post body from trusted content/posts HTML files
					dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
				/>

				<PostReadTracker slug={slug} title={post.title} />
				<NavRow />
			</AnimatedFrame>
		</main>
	);
}
