"use client";

import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import {
	useWhoChartAnimation,
	WHO_CHART,
	WHO_TICK,
	WhoChartBox,
} from "@/components/who-are-you/recharts/who-charts-shared";
import type { VpnSignal } from "@/lib/vpn-detect";

const tooltipStyle = {
	backgroundColor: "rgba(242, 236, 224, 0.96)",
	border: "1px solid rgba(42, 35, 28, 0.12)",
	borderRadius: 8,
	color: WHO_CHART.ink,
	fontSize: 12,
};

function shortName(s: string, max = 36) {
	return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Live VPN / proxy assessment signals: bar length = model weight; color = triggered or not. */
export function VpnSignalsChart({
	signals,
}: {
	signals: VpnSignal[];
}): React.ReactElement {
	const animate = useWhoChartAnimation();

	const data = signals.map((s) => ({
		key: s.name,
		label: shortName(s.name),
		full: s.name,
		weight: s.weight,
		detected: s.detected,
		detail: s.detail,
	}));

	return (
		<div className="vpn-signals-chart-wrap">
			<WhoChartBox
				height={Math.min(520, 48 + data.length * 28)}
				aria-label="VPN assessment signal weights"
			>
				<BarChart
					layout="vertical"
					data={data}
					margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
					barSize={18}
				>
					<CartesianGrid
						horizontal
						stroke={WHO_CHART.grid}
						strokeDasharray="3 3"
					/>
					<XAxis
						type="number"
						allowDecimals={true}
						tick={WHO_TICK}
						tickLine={false}
						axisLine={false}
						height={24}
					/>
					<YAxis
						type="category"
						dataKey="label"
						width={140}
						tick={{ fontSize: 9, fill: "rgba(42, 35, 28, 0.65)" }}
						interval={0}
						tickLine={false}
						axisLine={false}
					/>
					<Tooltip
						contentStyle={tooltipStyle}
						formatter={(w, _n, item) => {
							const d = item?.payload as {
								detected?: boolean;
								detail?: string;
							};
							return [
								`Weight ${w}${d?.detected ? " · triggered" : " · clear"}`,
								d?.detail ? String(d.detail).slice(0, 120) : "",
							];
						}}
						labelFormatter={(_l, p) =>
							(p?.[0]?.payload as { full?: string })?.full ?? ""
						}
					/>
					<Bar
						dataKey="weight"
						isAnimationActive={animate}
						radius={[0, 3, 3, 0]}
					>
						{data.map((d) => (
							<Cell
								key={d.key}
								fill={
									d.detected ? "rgba(168, 68, 68, 0.85)" : WHO_CHART.posthog
								}
							/>
						))}
					</Bar>
				</BarChart>
			</WhoChartBox>
		</div>
	);
}
