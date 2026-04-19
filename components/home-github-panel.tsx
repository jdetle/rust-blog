import Image from "next/image";

const GITHUB_ACTIVITY_GRAPH_SRC =
	"https://github-readme-activity-graph.vercel.app/graph?username=jdetle&hide_border=true";

export function HomeGithubPanel() {
	return (
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
					A Rust daemon that surfaces host resource pressure to AI coding
					agents so they stop issuing requests the machine cannot serve &mdash;
					operational hygiene for teams mandating agents on a mixed laptop
					fleet.{" "}
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
				<p className="work-meta">Agent discipline &middot; This repository</p>
				<p className="work-copy">
					Ninety-plus rules, each with an <code>Origin</code> section
					describing the class of defect it addresses &mdash; the memory layer
					a shipping agent needs and the most transferable artefact of the
					practice.{" "}
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
	);
}
