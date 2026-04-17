import type { Metadata } from "next";
import { AnimatedFrame } from "@/components/animated-frame";
import { NavRow } from "@/components/nav-row";

export const metadata: Metadata = {
	title: "Work with me",
	description:
		"Advisory-first: production agent systems, rules-as-memory, adversarial review, grounding. Full-time at PwC — outside work needs employer approval. Roughly ten hours a week outside the day job.",
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
						<h2>Capacity and approval</h2>
						<p>
							I work full-time at PwC. Anything formal (paid work, a named
							engagement, something that looks like a side contract) has to
							clear my employer&apos;s approval process. I&apos;m not going to
							skip that step, so build it into your timeline.
						</p>
						<p>
							Outside the day job I have on the order of{" "}
							<strong>ten hours a week</strong>. I want to put most of that
							toward <strong>advisory</strong> work: read what you&apos;re
							building, tell you where it&apos;s going to break, suggest what to
							fix first, point you at patterns I&apos;ve already written up
							here. That&apos;s the fit I&apos;m looking for.
						</p>
						<p>
							Deeper embeds (pair-build, install-the-system) are still possible
							when the scope fits that envelope and the paperwork is sorted. If
							you need someone to own implementation on a crunch deadline in off
							hours, I&apos;m not that person.
						</p>
					</section>

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
							<strong>Advisory</strong> (hourly or retainer) — This is the main
							thing. I review what you&apos;re building, tell you where
							it&apos;s going to break, and explain how to fix it. Best for
							teams that already have something in motion and want a second
							opinion before it bites them. Fits the weekly time box and the
							approval path more cleanly than a big build-out.
						</p>
						<p>
							<strong>Pair-build</strong> (weeks) — We ship something real
							together and I leave behind rules, docs, and scripts. Only when
							the scope fits my availability and employer sign-off. Not a
							default; ask if you think you need it.
						</p>
						<p>
							<strong>Install-the-system</strong> (fixed scope) — Worktrees,
							rules corpus, adversarial review pipeline, CI hooks, trained team.
							Same constraints: narrow enough to fit the hours I have, and
							approved through my employer.
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
							Email: <a href="mailto:jdetle@gmail.com">jdetle@gmail.com</a>
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
							I respond within a day or two. Mention if you already know you
							need employer-side approval on your end too — it helps set
							expectations. If you want to get a feel for how I think before
							reaching out, the posts are the best place to start.
						</p>
					</section>
				</article>

				<NavRow />
			</AnimatedFrame>
		</main>
	);
}
