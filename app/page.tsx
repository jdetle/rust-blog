import Image from "next/image";
import Link from "next/link";
import { AnimatedFrame } from "@/components/animated-frame";
import { HomeCtas } from "@/components/home-ctas";

const FEATURED_POSTS = [
	{
		slug: "rules-that-make-quality-sites-easy",
		title: "Rules That Make Quality Sites Easy",
		blurb:
			"90+ failure-driven rules, four enforcement layers, and the workflow that catches most of the dumb stuff before it ships.",
	},
	{
		slug: "memory-leaks-in-node",
		title: "Memory Leaks in Node",
		blurb:
			"Debugging a production memory leak with no local repro, a profiling tool that OOMs itself, and the unsatisfying fix that actually worked.",
	},
	{
		slug: "when-and-when-not-to-rage-against-your-corporate-machine-and-other-advice-for-working-inside-your-bigcorp",
		title: "Working Inside Your BigCorp",
		blurb:
			"Tickets, scope creep, code chameleons, and knowing when to shut up and fix the thing.",
	},
];

export default function HomePage() {
	return (
		<main className="site-shell">
			<AnimatedFrame>
				<header className="masthead">
					<p className="brand">John Detlefs</p>
					<p className="date-mark">
						Production systems and debugging war stories
					</p>
				</header>

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
								{/* ghchart PNG breaks when proxied/resized by next/image — load origin directly */}
								<Image
									unoptimized
									className="contrib-chart-img"
									src="https://ghchart.rshah.io/b07050/jdetle"
									alt="GitHub contribution activity for the last year"
									width={800}
									height={128}
								/>
							</a>
							<p className="work-copy contrib-chart-caption">
								Contribution graph (last year).{" "}
								<a href="https://github.com/jdetle">github.com/jdetle</a>
							</p>

							<article className="work-item">
								<h3>Guardian</h3>
								<p className="work-meta">Rust &middot; Open source</p>
								<p className="work-copy">
									System resource monitor daemon for Cursor agent
									sessions—tracks CPU, memory, and disk so long-running agents
									stay within bounds.{" "}
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

						<section className="panel">
							<h2 className="panel-title">Featured writing</h2>
							<ul className="featured-list">
								{FEATURED_POSTS.map((post) => (
									<li key={post.slug} className="featured-item">
										<Link href={`/posts/${post.slug}`}>{post.title}</Link>
										<p className="featured-blurb">{post.blurb}</p>
									</li>
								))}
							</ul>
						</section>
					</aside>
				</section>
			</AnimatedFrame>
		</main>
	);
}
