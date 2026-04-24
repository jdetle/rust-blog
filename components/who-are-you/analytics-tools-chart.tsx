"use client";

import type { ReactElement } from "react";
import { Cell, Pie, PieChart, Tooltip } from "recharts";
import {
	useWhoChartAnimation,
	WHO_CHART,
	WhoChartBox,
} from "@/components/who-are-you/recharts/who-charts-shared";

const tooltipStyle = {
	backgroundColor: "rgba(242, 236, 224, 0.96)",
	border: "1px solid rgba(42, 35, 28, 0.12)",
	borderRadius: 8,
	color: WHO_CHART.ink,
	fontSize: 12,
};

const COLORS = [
	WHO_CHART.posthog,
	WHO_CHART.warehouse,
	WHO_CHART.other,
	"#7a6b5a",
];

/** Live count of how many listed analytics scripts are active vs not on this page. */
export function AnalyticsToolsChart({
	tools,
}: {
	tools: { name: string; active: boolean }[];
}): ReactElement | null {
	const animate = useWhoChartAnimation();

	if (tools.length === 0) {
		return null;
	}

	const activeCount = tools.filter((t) => t.active).length;
	const inactiveCount = tools.length - activeCount;

	const data = [
		{ name: "Active on page", value: activeCount, fill: WHO_CHART.posthog },
		{ name: "Not loaded", value: inactiveCount, fill: "rgba(42, 35, 28, 0.2)" },
	].filter((d) => d.value > 0);

	return (
		<div className="analytics-tools-chart-wrap">
			<WhoChartBox
				height={200}
				aria-label={`${activeCount} of ${tools.length} known analytics scripts active`}
			>
				<PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
					<Pie
						data={data}
						dataKey="value"
						nameKey="name"
						cx="50%"
						cy="50%"
						innerRadius={44}
						outerRadius={72}
						paddingAngle={2}
						isAnimationActive={animate}
					>
						{data.map((e, i) => (
							<Cell key={e.name} fill={e.fill ?? COLORS[i % COLORS.length]} />
						))}
					</Pie>
					<Tooltip contentStyle={tooltipStyle} />
				</PieChart>
			</WhoChartBox>
		</div>
	);
}
