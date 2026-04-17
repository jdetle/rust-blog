import type { Metadata } from "next";
import { AnimatedFrame } from "@/components/animated-frame";
import { NavRow } from "@/components/nav-row";

export const metadata: Metadata = {
	title: "Work with me",
	description:
		"I help teams build agent systems that actually work in production — rules-as-memory, adversarial review, parallel orchestration, hallucination prevention. Available for advisory, pair-build, and install-the-system engagements.",
};

export default function WorkWithMePage() {
	return (
		<main className="site-shell">
			<AnimatedFrame className="article">
				<header className="list-header">
					<p className="eyebrow">Contracting</p>
					<h1 className="page-title">Work with me</h1>
					<p className="byline">
						I help teams ship agent systems that work in production — not demos,
						not proofs of concept, actual shipped systems with the ops layer to
						keep them running.
					</p>
				</header>

				<article className="article-content">
					<section>
						<h2>What I actually do</h2>
						<p>
							I build the discipline around AI agents — the rules, review
							protocols, orchestration patterns, and grounding systems that make
							them reliable enough to put in front of real users. Most teams
							have agents. Most teams don&apos;t have the ops layer that keeps
							agents from embarrassing them in production. That&apos;s what I
							build. I&apos;ve done it publicly on this blog and internally
							across multiple production codebases.
						</p>
						<p>
							The post{" "}
							<a href="/posts/2026-q2/what-i-actually-do">What I actually do</a>{" "}
							goes into more detail if you want the long version. The short
							version: rules-as-memory, parallel agent orchestration via git
							worktrees, adversarial review before every push, and grounding for
							production agents that talk to users.
						</p>
					</section>

					<section>
						<h2>Problems I typically solve</h2>
						<p>
							<strong>Our agents hallucinate in production.</strong> This is
							almost always a grounding problem. The agent has no verification
							step before it presents claims to users. I build the
							HMAC-fingerprinted response layer and verification tooling that
							catches fabricated claims before they surface.
						</p>
						<p>
							<strong>Our AI initiative is stuck in demo.</strong> Usually
							missing three things: persistent memory between sessions
							(rules-as-memory), a way to run agents in parallel without branch
							collision (worktrees), and a review step that catches failures
							before users do. I&apos;ve wired up all three. Multiple times.
						</p>
						<p>
							<strong>
								Our agents keep making the same mistakes over and over.
							</strong>{" "}
							No institutional memory. Every session starts cold. I build the
							rules corpus — one rule per failure, with the correct pattern
							baked in, loaded into context on every session. Ninety-odd rules
							in this codebase right now. Each one represents a mistake we
							already paid for.
						</p>
						<p>
							<strong>
								We can&apos;t review AI-generated code fast enough.
							</strong>{" "}
							The review bottleneck is real. I build adversarial review
							pipelines — structured prompts where one persona attacks the diff
							(security holes, scope creep, accidental reversions) and one
							defends it. It&apos;s not a replacement for human review.
							It&apos;s the layer that catches the obvious stuff so human review
							can focus on the hard stuff.
						</p>
						<p>
							<strong>
								We want to adopt agentic engineering but don&apos;t know where
								to start.
							</strong>{" "}
							I set up the worktree structure, write the first batch of rules,
							build the review pipeline, and train the team. Leave-behind docs,
							scripts, and a rules corpus you can build on.
						</p>
					</section>

					<section>
						<h2>How to engage</h2>
						<p>
							<strong>Advisory</strong> (hourly or retainer) — I review what
							you&apos;re building, tell you where it&apos;s going to break, and
							explain how to fix it. Good for teams that have something running
							and want a second opinion before it bites them.
						</p>
						<p>
							<strong>Pair-build</strong> (weeks) — I embed, we ship something
							real together, and I leave behind rules, docs, and scripts your
							team can use after I&apos;m gone. Good for teams that want to move
							fast and want experienced hands on the keyboard.
						</p>
						<p>
							<strong>Install-the-system</strong> (fixed scope) — worktrees,
							rules corpus, adversarial review pipeline, CI hooks, trained team,
							done. Good for teams that know they need the infrastructure but
							don&apos;t have time to build it themselves.
						</p>
					</section>

					<section>
						<h2>Proof</h2>
						<p>
							Everything I&apos;ve described is documented and public. This blog
							is built on the same system I&apos;d install for you.
						</p>
						<ul>
							<li>
								<a href="/posts">Posts</a> — including{" "}
								<a href="/posts/2026-q1/rules-that-make-quality-sites-easy">
									Rules that make quality sites easy
								</a>{" "}
								and{" "}
								<a href="/posts/2026-q2/what-i-actually-do">
									What I actually do
								</a>
							</li>
							<li>
								The rules corpus (~90 rules) is in <code>.cursor/rules/</code> —
								each rule has an Origin section explaining the failure that
								triggered it
							</li>
							<li>
								The skills library covers adversarial review, the blog pipeline,
								finish-work-merge-ci, and others — under{" "}
								<code>.cursor/skills/</code>
							</li>
							<li>
								The adversarial review framework (personas, debate protocol,
								evaluation rubric) is documented under{" "}
								<code>docs/adversarial-review/</code>
							</li>
						</ul>
						<p>
							The multi-version post format (every post has a human version and
							an AI-generated contrast) is itself an example of how I use the
							system in practice. The AI version is labeled so you can see the
							difference.
						</p>
					</section>

					<section>
						<h2>Contact</h2>
						<p>
							Email:{" "}
							<a href="mailto:johndetlefs@gmail.com">johndetlefs@gmail.com</a>
						</p>
						<p>
							LinkedIn:{" "}
							<a
								href="https://linkedin.com/in/jdetle"
								rel="noopener noreferrer"
							>
								linkedin.com/in/jdetle
							</a>
						</p>
						<p>
							I respond within a day or two. If you want to get a feel for how I
							think before reaching out, the posts are the best place to start.
						</p>
					</section>
				</article>

				<NavRow />
			</AnimatedFrame>
		</main>
	);
}
