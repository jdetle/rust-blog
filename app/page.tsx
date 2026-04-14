import Image from "next/image";
import Link from "next/link";
import { AnimatedFrame } from "@/components/animated-frame";
import { HomeCtas } from "@/components/home-ctas";
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
						Production systems and debugging war stories
					</p>
				</header>

				<section className="home-hero" aria-labelledby="home-hero-heading">
					<p className="eyebrow">
						Senior Software Engineer &middot; Reliability &amp; Growth
					</p>
					<h1 id="home-hero-heading">
						I build the systems behind the buy button.
					</h1>
					<p className="lede">
						Seven years of shipping customer-facing software where downtime
						costs real money. At GoDaddy I helped evolve the dashboard and
						account surfaces behind $200M+ in annual revenue, cutting p95
						latency and improving experiment quality across millions of
						sessions. At PwC (via Kunai) I build cloud infrastructure for
						nine-figure consulting engagements.
					</p>

					<HomeCtas />
				</section>

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
									Framework-agnostic monitor for agentic resource consumption:
									tracks CPU, memory, and disk so long-running coding agents
									stay within bounds, independent of editor or agent stack.{" "}
									<a
										href="https://github.com/jdetle/guardian"
										target="_blank"
										rel="noopener noreferrer"
									>
										github.com/jdetle/guardian
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
							<li className="chip">TypeScript / React / Next.js</li>
							<li className="chip">AWS / Cloud Infrastructure</li>
							<li className="chip">Node.js / Rust</li>
							<li className="chip">Observability / SRE</li>
							<li className="chip">Performance / Experimentation</li>
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
									Led frontend reliability for{" "}
									<code>dashboard.godaddy.com</code>, the primary surface for
									20M+ customers managing domains, hosting, and email. Drove p95
									latency reductions, built the A/B experimentation framework
									used by the growth org, and shipped simplification work that
									measurably reduced support ticket volume.
								</p>
							</article>

							<article className="work-item">
								<h3>Kunai (PwC Network)</h3>
								<p className="work-meta">
									Senior Cloud Developer &middot; Advisory Technology
								</p>
								<p className="work-copy">
									Building internal platforms and cloud tooling for PwC&apos;s
									advisory practice. Infrastructure-as-code, observability
									pipelines, and developer experience for consulting teams that
									ship under tight client timelines.
								</p>
							</article>

							<article className="work-item">
								<h3>Meshify &amp; Earlier</h3>
								<p className="work-meta">Full-stack &middot; IoT &amp; Data</p>
								<p className="work-copy">
									Legacy-to-React migrations, Go proxy services, and production
									workflow reliability for IoT sensor platforms. End-to-end
									ownership from database to dashboard.
								</p>
							</article>
						</section>
					</aside>
				</section>
			</AnimatedFrame>
		</main>
	);
}
