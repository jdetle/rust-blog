export function HomeSelectedWork() {
	return (
		<section className="panel">
			<h2 className="panel-title">Selected work</h2>

			<article className="work-item">
				<h3>GoDaddy</h3>
				<p className="work-meta">
					Senior SDE &middot; Growth &amp; Account Experiences
				</p>
				<p className="work-copy">
					Owned the experimentation framework for{" "}
					<code>dashboard.godaddy.com</code> &mdash; the primary surface for
					20M+ customers &mdash; and the frontend reliability of the revenue
					surfaces behind it. The same instincts for rollout gates, experiment
					quality, and silent-failure detection are what make an agentic rollout
					actually safe to mandate across a team.
				</p>
			</article>

			<article className="work-item">
				<h3>Kunai (PwC Network)</h3>
				<p className="work-meta">
					Senior Cloud Developer &middot; Advisory Technology
				</p>
				<p className="work-copy">
					Building developer experience and cloud tooling for consulting teams
					working under an AI-first mandate. Infrastructure-as-code,
					observability pipelines, and the agent-workflow discipline that keeps
					engagements shipping on a client clock instead of debugging their own
					tooling.
				</p>
			</article>

			<article className="work-item">
				<h3>Meshify &amp; Earlier</h3>
				<p className="work-meta">Full-stack &middot; IoT &amp; Data</p>
				<p className="work-copy">
					End-to-end ownership from database to dashboard on IoT sensor
					platforms &mdash; legacy-to-React migrations, Go proxy services, and
					the kind of production workflow reliability work that teaches you
					which failures stay silent until a customer reports them.
				</p>
			</article>
		</section>
	);
}
