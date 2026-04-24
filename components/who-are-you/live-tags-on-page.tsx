"use client";

import type { ReactElement } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import {
	useWhoChartAnimation,
	WHO_CHART,
	WHO_TICK,
	WhoChartBox,
} from "@/components/who-are-you/recharts/who-charts-shared";

const tooltipStyle = {
	backgroundColor: "rgba(242, 236, 224, 0.96)",
	border: "1px solid rgba(42, 35, 28, 0.12)",
	borderRadius: 8,
	color: WHO_CHART.ink,
	fontSize: 12,
};

/**
 * Live detection: which known analytics products appear active on *this* page
 * (window globals), plus Google Tag Manager when present. Not the static vendor matrix.
 */
export function LiveTagsOnThisPage({
	tools,
	gtmPresent,
}: {
	tools: { name: string; active: boolean }[];
	gtmPresent: boolean;
}): ReactElement {
	const animate = useWhoChartAnimation();

	const data = [
		...tools.map((t) => ({
			short: t.name.length > 22 ? `${t.name.slice(0, 20)}…` : t.name,
			full: t.name,
			active: t.active ? 1 : 0,
		})),
		{
			short: "Google Tag Manager",
			full: "Google Tag Manager (container on this page)",
			active: gtmPresent ? 1 : 0,
		},
	];

	return (
		<div className="live-tags-chart-wrap">
			<h3 className="live-tags-heading">This page, right now</h3>
			<p className="detect-note live-tags-sub">
				Live script detection for common tags (not a full audit). 1 = script
				signature seen; 0 = not detected in this page context.
			</p>
			<WhoChartBox
				height={Math.min(400, 36 + data.length * 32)}
				aria-label="Analytics tools and GTM detected on this page"
			>
				<BarChart
					layout="vertical"
					data={data}
					margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
					barSize={22}
				>
					<CartesianGrid
						horizontal
						stroke={WHO_CHART.grid}
						strokeDasharray="3 3"
					/>
					<XAxis
						type="number"
						domain={[0, 1]}
						ticks={[0, 1]}
						tick={WHO_TICK}
						tickLine={false}
						axisLine={false}
						height={24}
					/>
					<YAxis
						type="category"
						dataKey="short"
						width={128}
						tick={{ fontSize: 10, fill: "rgba(42, 35, 28, 0.65)" }}
						interval={0}
						tickLine={false}
						axisLine={false}
					/>
					<Tooltip
						contentStyle={tooltipStyle}
						formatter={(v) =>
							Number(v) === 1 ? ["Detected", ""] : ["Not seen", ""]
						}
						labelFormatter={(_l, p) =>
							(p?.[0]?.payload as { full: string })?.full ?? ""
						}
					/>
					<Bar
						dataKey="active"
						fill={WHO_CHART.posthog}
						isAnimationActive={animate}
						radius={[0, 3, 3, 0]}
					/>
				</BarChart>
			</WhoChartBox>
		</div>
	);
}
