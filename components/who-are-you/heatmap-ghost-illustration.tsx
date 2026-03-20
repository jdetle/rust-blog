/**
 * Illustrative only — not real session replay or heatmap data from this page.
 */

export function HeatmapGhostIllustration() {
	return (
		<div
			className="heatmap-ghost"
			role="img"
			aria-label="Illustrative click heatmap placeholder"
		>
			<div className="heatmap-ghost-frame">
				<div className="heatmap-ghost-blob heatmap-ghost-blob--a" />
				<div className="heatmap-ghost-blob heatmap-ghost-blob--b" />
				<div className="heatmap-ghost-blob heatmap-ghost-blob--c" />
			</div>
			<p className="heatmap-ghost-caption">
				Illustrative: products like session replay aggregate pointer and scroll
				data into heatmaps &mdash; far richer than a page view count.
			</p>
		</div>
	);
}
