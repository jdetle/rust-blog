import type { Metadata } from "next";
import Link from "next/link";
import { AnimatedFrame } from "@/components/animated-frame";
import { AuthorshipBadge } from "@/components/authorship-badge";
import { NavRow } from "@/components/nav-row";
import { estimateReadingTime, getAllQuarters } from "@/lib/posts";

export const metadata: Metadata = {
	title: "Posts",
	description: "Notes and essays by John Detlefs.",
};

export default function PostsPage() {
	const quarters = getAllQuarters();

	return (
		<main className="site-shell">
			<AnimatedFrame className="article">
				<header className="list-header">
					<p className="eyebrow">Archive</p>
					<h1 className="page-title">Notes and essays</h1>
				</header>

				<div className="quarter-timeline">
					{quarters.map((q) => (
						<div key={q.id} className="quarter-group">
							<span className="quarter-marker" />
							<p className="quarter-label">{q.label}</p>
							<ul className="quarter-posts">
								{q.posts.map((post) => {
									const bodyHtml =
										post.kind === "multi"
											? (post.versions.find(
													(v) => v.key === post.defaultVersion,
												)?.bodyHtml ?? "")
											: post.bodyHtml;
									const readTime = estimateReadingTime(bodyHtml);
									return (
										<li key={post.slug}>
											<Link href={`/posts/${post.slug}`}>
												<span className="quarter-post-title">
													{post.title}
													<AuthorshipBadge authorship={post.authorship} />
												</span>
												<span className="quarter-post-date">
													{post.date}
													{post.date && " · "}
													<span className="quarter-post-reading-time">
														{readTime} min read
													</span>
												</span>
											</Link>
										</li>
									);
								})}
							</ul>
						</div>
					))}
				</div>

				<NavRow
					links={[
						{ href: "/", label: "Back home" },
						{ href: "/who-are-you", label: "Who are you?" },
						{ href: "/work-with-me", label: "Work with me" },
					]}
				/>
			</AnimatedFrame>
		</main>
	);
}
