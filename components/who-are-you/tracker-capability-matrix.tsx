/**
 * Documented product capabilities (typical deployments) — not live detection.
 * See each vendor&apos;s docs for your account and region.
 */

type Cell = "yes" | "partial" | "no" | "na";

function CellMark({ v }: { v: Cell }) {
	if (v === "yes") return <span className="matrix-yes">Yes</span>;
	if (v === "partial") return <span className="matrix-partial">Often</span>;
	if (v === "no") return <span className="matrix-no">No</span>;
	return <span className="matrix-na">—</span>;
}

const ROWS: {
	tool: string;
	note?: string;
	pageviews: Cell;
	customEvents: Cell;
	sessionReplay: Cell;
	heatmaps: Cell;
	identity: Cell;
	thirdPartyCookies: Cell;
}[] = [
	{
		tool: "Google Analytics 4",
		pageviews: "yes",
		customEvents: "yes",
		sessionReplay: "no",
		heatmaps: "partial",
		identity: "yes",
		thirdPartyCookies: "partial",
		note: "Often via gtag / GTM; BigQuery export optional.",
	},
	{
		tool: "Google Tag Manager",
		pageviews: "na",
		customEvents: "na",
		sessionReplay: "na",
		heatmaps: "na",
		identity: "na",
		thirdPartyCookies: "partial",
		note: "Container only — loads whatever tags you configure.",
	},
	{
		tool: "Microsoft Clarity",
		pageviews: "yes",
		customEvents: "partial",
		sessionReplay: "yes",
		heatmaps: "yes",
		identity: "partial",
		thirdPartyCookies: "partial",
	},
	{
		tool: "PostHog (typical SaaS)",
		pageviews: "yes",
		customEvents: "yes",
		sessionReplay: "partial",
		heatmaps: "partial",
		identity: "yes",
		thirdPartyCookies: "partial",
		note: "Replay & flags depend on project settings.",
	},
	{
		tool: "Plausible",
		pageviews: "yes",
		customEvents: "partial",
		sessionReplay: "no",
		heatmaps: "no",
		identity: "partial",
		thirdPartyCookies: "no",
		note: "Privacy-first; aggregated by design.",
	},
	{
		tool: "Host web analytics",
		pageviews: "yes",
		customEvents: "no",
		sessionReplay: "no",
		heatmaps: "no",
		identity: "partial",
		thirdPartyCookies: "no",
		note: "Web Vitals + page views; no session replay in product.",
	},
	{
		tool: "Meta Pixel",
		pageviews: "yes",
		customEvents: "yes",
		sessionReplay: "no",
		heatmaps: "no",
		identity: "yes",
		thirdPartyCookies: "yes",
		note: "Cross-site via Meta&apos;s ecosystem when permitted.",
	},
];

export function TrackerCapabilityMatrix() {
	return (
		<div className="tracker-matrix-wrap">
			<p className="detect-note">
				Typical capabilities when a product is enabled &mdash; not a live audit
				of <em>this</em> page. Your org&apos;s configuration and consent banners
				change what actually runs.
			</p>
			<section
				className="tracker-matrix-scroll"
				aria-label="Tracker capability comparison"
			>
				<table className="tracker-matrix">
					<thead>
						<tr>
							<th scope="col">Tool</th>
							<th scope="col">Page views</th>
							<th scope="col">Custom events</th>
							<th scope="col">Session replay</th>
							<th scope="col">Heatmaps</th>
							<th scope="col">User / ID stitching</th>
							<th scope="col">3rd-party cookies</th>
						</tr>
					</thead>
					<tbody>
						{ROWS.map((row) => (
							<tr key={row.tool}>
								<th scope="row">
									{row.tool}
									{row.note ? (
										<span className="matrix-tool-note"> {row.note}</span>
									) : null}
								</th>
								<td>
									<CellMark v={row.pageviews} />
								</td>
								<td>
									<CellMark v={row.customEvents} />
								</td>
								<td>
									<CellMark v={row.sessionReplay} />
								</td>
								<td>
									<CellMark v={row.heatmaps} />
								</td>
								<td>
									<CellMark v={row.identity} />
								</td>
								<td>
									<CellMark v={row.thirdPartyCookies} />
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</section>
		</div>
	);
}
