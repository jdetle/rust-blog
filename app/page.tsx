import Image from "next/image";
import Link from "next/link";
import { AnimatedFrame } from "@/components/animated-frame";
import { HomeCtas } from "@/components/home-ctas";
import { getRecentPosts } from "@/lib/posts";

/** ghchart.rshah.io no longer resolves (dead domain). Embed via github-readme-activity-graph (SVG). */
const GITHUB_ACTIVITY_GRAPH_SRC =
	"https://github-readme-activity-graph.vercel.app/graph?username=jdetle&hide_border=true";

const RECENT_POSTS_COUNT = 6;

export default function HomePage() {
	const recentPosts = getRecentPosts(RECENT_POSTS_COUNT);

	return (
		<main className="site-shell">
			<AnimatedFrame>
				<header className="masthead">
					<p className="brand">John Detlefs</p>
					<p className="date-mark">
						Production systems and debugging war stories
					</p>
				</header>

				<section
					className="home-priority"
					aria-labelledby="home-priority-heading"
				>
					<h2 id="home-priority-heading" className="visually-hidden">
						Recent writing and interactive demo
					</h2>
					<div className="home-priority-grid">
						<section className="panel home-recent-panel">
							<h2 className="panel-title">Latest from the blog</h2>
							<ul className="recent-posts-list">
								{recentPosts.map((post) => (
									<li key={post.slug} className="recent-posts-item">
										<Link href={`/posts/${post.slug}`}>{post.title}</Link>
										<p className="recent-posts-meta">{post.date}</p>
									</li>
								))}
							</ul>
							<p className="recent-posts-footer">
								<Link className="recent-posts-all" href="/posts">
									All posts →
								</Link>
							</p>
						</section>

						<section className="panel home-who-spotlight home-who-spotlight--hero">
							<h2 className="panel-title">Who are you?</h2>
							<p className="work-copy home-who-lede">
								Live demo: what this site can infer from your browser, the edge,
								and common analytics scripts — in one scrollable page.
							</p>
							<p className="home-who-spotlight-cta">
								<Link className="btn btn-primary" href="/who-are-you">
									Open the demo
								</Link>
							</p>
						</section>
					</div>
				</section>

				<section className="home-grid">
					<article className="article">
						<p className="eyebrow">
							Senior Software Engineer &middot; Reliability &amp; Growth
						</p>
						<h1>I build the systems behind the buy button.</h1>
						<p className="lede">
							Seven years of shipping customer-facing software where downtime
							costs real money. At GoDaddy I helped evolve the dashboard and
							account surfaces behind $200M+ in annual revenue, cutting p95
							latency and improving experiment quality across millions of
							sessions. At PwC (via Kunai) I build cloud infrastructure for
							nine-figure consulting engagements.
						</p>

						<HomeCtas />

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
