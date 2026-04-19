import Link from "next/link";
import { AnimatedFrame } from "@/components/animated-frame";
import { HomeGithubPanel } from "@/components/home-github-panel";
import { HomeHeroAbTest } from "@/components/home-hero-ab";
import { HomeSelectedWork } from "@/components/home-selected-work";
import { HomeWhoSnapshot } from "@/components/home-who-snapshot";
import {
	estimateReadingTime,
	getDefaultVersionHtml,
	getPlainTextExcerpt,
	getRecentPosts,
} from "@/lib/posts";

const RECENT_WINDOW = 6;

export default function HomePage() {
	const recent = getRecentPosts(RECENT_WINDOW);
	const leadPost = recent[0];
	const morePosts = recent.slice(1);

	const leadMinutes = leadPost
		? estimateReadingTime(getDefaultVersionHtml(leadPost))
		: 1;

	const leadExcerpt = leadPost ? getPlainTextExcerpt(leadPost, 240) : "";

	return (
		<main className="site-shell">
			<AnimatedFrame>
				<header className="masthead">
					<p className="brand">John Detlefs</p>
					<p className="date-mark">
						Agentic engineering, production reliability, and the discipline
						between them
					</p>
				</header>

				<HomeHeroAbTest />

				{leadPost ? (
					<section
						className="home-lead-post"
						aria-labelledby="home-lead-heading"
					>
						<p className="eyebrow home-lead-eyebrow">Latest on the journal</p>
						<h2 id="home-lead-heading" className="home-lead-title">
							<Link href={`/posts/${leadPost.slug}`}>{leadPost.title}</Link>
						</h2>
						<p className="home-lead-meta">
							{leadPost.date}
							<span className="home-lead-meta-sep" aria-hidden="true">
								{" "}
								·{" "}
							</span>
							{leadMinutes} min read
						</p>
						<p className="home-lead-excerpt">{leadExcerpt}</p>
						<p className="home-lead-cta-wrap">
							<Link className="home-lead-cta" href={`/posts/${leadPost.slug}`}>
								Read the full essay →
							</Link>
						</p>
					</section>
				) : null}

				<section
					className="home-priority"
					aria-labelledby="home-priority-heading"
				>
					<h2 id="home-priority-heading" className="visually-hidden">
						More posts and interactive demo
					</h2>
					<div className="home-priority-grid">
						<section className="panel home-recent-panel">
							<h2 className="panel-title">More from the blog</h2>
							{morePosts.length > 0 ? (
								<ul className="recent-posts-list">
									{morePosts.map((post) => (
										<li key={post.slug} className="recent-posts-item">
											<Link href={`/posts/${post.slug}`}>{post.title}</Link>
											<p className="recent-posts-meta">{post.date}</p>
										</li>
									))}
								</ul>
							) : (
								<p className="recent-posts-empty">
									No additional posts yet — check back soon.
								</p>
							)}
							<p className="recent-posts-footer">
								<Link className="recent-posts-all" href="/posts">
									All posts →
								</Link>
							</p>
						</section>

						<HomeWhoSnapshot />
					</div>
				</section>

				<section className="home-grid">
					<article className="article">
						<HomeGithubPanel />

						<p className="meta">
							Currently at <strong>Kunai (PwC Network)</strong> as a Senior
							Cloud Developer. Previously Senior SDE at <strong>GoDaddy</strong>
							. Before that: full-stack across IoT (Meshify), crypto, and data
							tooling.
						</p>

						<ul className="chip-row">
							<li className="chip">Agentic engineering / LLM tooling</li>
							<li className="chip">Rust / systems programming</li>
							<li className="chip">TypeScript / React / Next.js</li>
							<li className="chip">AWS / cloud infrastructure</li>
							<li className="chip">Observability / SRE</li>
							<li className="chip">Experimentation / rollout design</li>
						</ul>
					</article>

					<aside>
						<HomeSelectedWork />
					</aside>
				</section>
			</AnimatedFrame>
		</main>
	);
}
