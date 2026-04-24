"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
	useWhoChartAnimation,
	WHO_CHART,
	WhoChartBox,
} from "./who-charts-shared";

function verdictFill(verdict: string): string {
	if (verdict === "residential") return "var(--hazel-sage, #6b7d5e)";
	if (verdict === "likely-vpn" || verdict === "tor") return "#a84444";
	if (verdict === "datacenter" || verdict === "proxy" || verdict === "unknown")
		return "var(--hazel-amber, #c9a227)";
	return "var(--hazel-bark, #8b5a3c)";
}

const trackFill = "rgba(201, 162, 39, 0.14)";

/**
 * Single horizontal 0–100 value bar. Live `value` only; `verdict` tints the fill.
 */
export function WhoScalarBar({
	value,
	verdict,
	ariaLabel,
}: {
	value: number;
	verdict: string;
	ariaLabel: string;
}): React.ReactElement {
	const animate = useWhoChartAnimation();
	const v = Math.max(0, Math.min(100, value));
	const fill = verdictFill(verdict);
	const data = [{ n: "v", p: v }];

	return (
		<WhoChartBox height={52} aria-label={ariaLabel}>
			<BarChart
				layout="vertical"
				data={data}
				margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
				barSize={22}
			>
				<CartesianGrid horizontal={false} vertical stroke={WHO_CHART.grid} />
				<XAxis
					type="number"
					domain={[0, 100]}
					tickCount={6}
					tick={{ fontSize: 10, fill: "rgba(42, 35, 28, 0.55)" }}
					tickLine={false}
					axisLine={false}
					height={20}
					unit="%"
				/>
				<YAxis
					type="category"
					dataKey="n"
					width={0}
					tick={false}
					axisLine={false}
				/>
				<Bar
					dataKey="p"
					name="score"
					fill={fill}
					isAnimationActive={animate}
					radius={[0, 4, 4, 0]}
					background={{ fill: trackFill }}
				/>
			</BarChart>
		</WhoChartBox>
	);
}

/** Exposure surface score — left-to-right sage → terracotta gradient. */
export function WhoExposureBar({
	value,
	ariaLabel,
	gradientId,
}: {
	value: number;
	ariaLabel: string;
	gradientId: string;
}): React.ReactElement {
	const animate = useWhoChartAnimation();
	const v = Math.max(0, Math.min(100, value));
	const data = [{ n: "e", p: v }];

	return (
		<WhoChartBox height={52} aria-label={ariaLabel}>
			<BarChart
				layout="vertical"
				data={data}
				margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
				barSize={22}
			>
				<defs>
					<linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
						<stop offset="0%" stopColor="rgba(107, 125, 94, 0.9)" />
						<stop offset="100%" stopColor="rgba(176, 112, 80, 0.95)" />
					</linearGradient>
				</defs>
				<CartesianGrid horizontal={false} vertical stroke={WHO_CHART.grid} />
				<XAxis
					type="number"
					domain={[0, 100]}
					tickCount={6}
					tick={{ fontSize: 10, fill: "rgba(42, 35, 28, 0.55)" }}
					tickLine={false}
					axisLine={false}
					height={20}
					unit="%"
				/>
				<YAxis
					type="category"
					dataKey="n"
					width={0}
					tick={false}
					axisLine={false}
				/>
				<Bar
					dataKey="p"
					fill={`url(#${gradientId})`}
					isAnimationActive={animate}
					radius={[0, 4, 4, 0]}
					background={{ fill: trackFill }}
				/>
			</BarChart>
		</WhoChartBox>
	);
}
