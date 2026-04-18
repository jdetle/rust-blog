import Image from "next/image";
import Link from "next/link";
import { AnimatedFrame } from "@/components/animated-frame";
import { HomeHeroAbTest } from "@/components/home-hero-ab";
import { HomeWhoSnapshot } from "@/components/home-who-snapshot";
import {
	estimateReadingTime,
	getDefaultVersionHtml,
	getPlainTextExcerpt,
	getRecentPosts,
} from "@/lib/posts";

/** ghchart.rshah.io no longer resolves (dead domain). Embed via github-readme-activity-graph (SVG). */
const GITHUB_ACTIVITY_GRAPH_SRC =
	"https://github-readme-activity-graph.vercel.app/graph?username=jdetle&hide_border=true";

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
						<section className="panel github-panel github-panel--lead">
							<h2 className="panel-title">GitHub</h2>
							<a
								className="contrib-chart-link"
								href="https://github.com/jdetle"
								target="_blank"
								rel="noopener noreferrer"
							>
								<Image
									unoptimized
									className="contrib-chart-img"
									src={GITHUB_ACTIVITY_GRAPH_SRC}
									alt="GitHub commit activity over the last year"
									width={1200}
									height={420}
								/>
							</a>
							<p className="work-copy contrib-chart-caption">
								Recent public commit activity.{" "}
								<a href="https://github.com/jdetle">github.com/jdetle</a>
							</p>

							<article className="work-item">
								<h3>Guardian</h3>
								<p className="work-meta">Rust &middot; Open source</p>
								<p className="work-copy">
									A Rust daemon that surfaces host resource pressure to AI
									coding agents so they stop issuing requests the machine cannot
									serve &mdash; operational hygiene for teams mandating agents
									on a mixed laptop fleet.{" "}
									<a
										href="https://github.com/jdetle/guardian"
										target="_blank"
										rel="noopener noreferrer"
									>
										github.com/jdetle/guardian
									</a>
								</p>
							</article>

							<article className="work-item">
								<h3>Rules corpus</h3>
								<p className="work-meta">
									Agent discipline &middot; This repository
								</p>
								<p className="work-copy">
									Ninety-plus rules, each with an <code>Origin</code> section
									describing the class of defect it addresses &mdash; the memory
									layer a shipping agent needs and the most transferable
									artefact of the practice.{" "}
									<a
										href="https://github.com/jdetle/rust-blog/tree/main/.cursor/rules"
										target="_blank"
										rel="noopener noreferrer"
									>
										.cursor/rules/
									</a>
								</p>
							</article>
						</section>

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
						<section className="panel">
							<h2 className="panel-title">Selected work</h2>

							<article className="work-item">
								<h3>GoDaddy</h3>
								<p className="work-meta">
									Senior SDE &middot; Growth &amp; Account Experiences
								</p>
								<p className="work-copy">
									Owned the experimentation framework for{" "}
									<code>dashboard.godaddy.com</code> &mdash; the primary surface
									for 20M+ customers &mdash; and the frontend reliability of the
									revenue surfaces behind it. The same instincts for rollout
									gates, experiment quality, and silent-failure detection are
									what make an agentic rollout actually safe to mandate across a
									team.
								</p>
							</article>

							<article className="work-item">
								<h3>Kunai (PwC Network)</h3>
								<p className="work-meta">
									Senior Cloud Developer &middot; Advisory Technology
								</p>
								<p className="work-copy">
									Building developer experience and cloud tooling for consulting
									teams working under an AI-first mandate.
									Infrastructure-as-code, observability pipelines, and the
									agent-workflow discipline that keeps engagements shipping on a
									client clock instead of debugging their own tooling.
								</p>
							</article>

							<article className="work-item">
								<h3>Meshify &amp; Earlier</h3>
								<p className="work-meta">Full-stack &middot; IoT &amp; Data</p>
								<p className="work-copy">
									End-to-end ownership from database to dashboard on IoT sensor
									platforms &mdash; legacy-to-React migrations, Go proxy
									services, and the kind of production workflow reliability work
									that teaches you which failures stay silent until a customer
									reports them.
								</p>
							</article>
						</section>
					</aside>
				</section>
			</AnimatedFrame>
		</main>
	);
}
