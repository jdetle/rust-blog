"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import {
	useWhoChartAnimation,
	WHO_CHART,
	WHO_TICK,
	WhoChartBox,
} from "@/components/who-are-you/recharts/who-charts-shared";
import type { ThirdPartyHostAgg } from "@/lib/third-party-resources";
import { aggregateThirdPartyResources } from "@/lib/third-party-resources";

const MAX_ROWS = 14;

const tooltipStyle = {
	backgroundColor: "rgba(242, 236, 224, 0.96)",
	border: "1px solid rgba(42, 35, 28, 0.12)",
	borderRadius: 8,
	color: WHO_CHART.ink,
	fontSize: 12,
};

function shortHost(h: string, max = 28) {
	return h.length > max ? `${h.slice(0, max - 1)}…` : h;
}

export function ThirdPartyConstellation() {
	const [hosts, setHosts] = useState<ThirdPartyHostAgg[]>([]);
	const [ready, setReady] = useState(false);
	const uid = useId().replace(/:/g, "");
	const gradId = `tp-grad-${uid}`;
	const animate = useWhoChartAnimation();

	useEffect(() => {
		const run = () => {
			try {
				const origin = window.location.origin;
				const entries = performance.getEntriesByType(
					"resource",
				) as PerformanceResourceTiming[];
				setHosts(aggregateThirdPartyResources(origin, entries));
			} catch {
				setHosts([]);
			}
			setReady(true);
		};
		const t = window.setTimeout(run, 2000);
		return () => window.clearTimeout(t);
	}, []);

	const chartData = useMemo(() => {
		return hosts.slice(0, MAX_ROWS).map((h) => ({
			label: shortHost(h.host),
			fullHost: h.host,
			count: h.count,
			types: h.initiatorTypes.join(", "),
		}));
	}, [hosts]);

	if (!ready) {
		return (
			<p className="detect-note loading-pulse">
				Mapping outbound requests&hellip;
			</p>
		);
	}

	if (chartData.length === 0) {
		return (
			<div className="constellation-empty">
				<p className="detect-note">
					No cross-origin resource requests recorded yet, or the browser hid
					details (cross-origin timing can be limited).
				</p>
			</div>
		);
	}

	return (
		<>
			<p className="detect-note">
				Each bar is a hostname your browser contacted while loading this page
				(scripts, pixels, fonts, APIs). Longer bars mean more requests. This is
				a <strong>minimum</strong> &mdash; some third parties hide details from
				Resource Timing.
			</p>
			<div className="constellation-chart-wrap">
				<WhoChartBox
					height={Math.min(420, 48 + chartData.length * 26)}
					className="constellation-recharts"
					aria-label="Third-party hosts by request count"
				>
					<BarChart
						layout="vertical"
						data={chartData}
						margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
						barSize={18}
					>
						<defs>
							<linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
								<stop offset="0%" stopColor="rgba(107, 125, 94, 0.75)" />
								<stop offset="100%" stopColor="rgba(201, 162, 39, 0.75)" />
							</linearGradient>
						</defs>
						<CartesianGrid
							horizontal
							stroke={WHO_CHART.grid}
							strokeDasharray="3 3"
						/>
						<XAxis
							type="number"
							allowDecimals={false}
							tick={WHO_TICK}
							tickLine={false}
							axisLine={false}
							height={24}
						/>
						<YAxis
							type="category"
							dataKey="label"
							width={108}
							tick={{ fontSize: 10, fill: "rgba(42, 35, 28, 0.65)" }}
							interval={0}
							tickLine={false}
							axisLine={false}
						/>
						<Tooltip
							contentStyle={tooltipStyle}
							formatter={(val) => [
								`${val} request${Number(val) === 1 ? "" : "s"}`,
								"Count",
							]}
							labelFormatter={(_l, p) =>
								(p?.[0]?.payload as { fullHost?: string })?.fullHost ?? ""
							}
						/>
						<Bar
							dataKey="count"
							fill={`url(#${gradId})`}
							isAnimationActive={animate}
							radius={[0, 3, 3, 0]}
						/>
					</BarChart>
				</WhoChartBox>
			</div>
			<ul className="constellation-legend">
				{hosts.slice(0, MAX_ROWS).map((h) => (
					<li key={h.host}>
						<span className="constellation-legend-host">{h.host}</span>
						<span className="constellation-legend-meta">
							{h.count}× &middot; {h.initiatorTypes.join(", ")}
						</span>
					</li>
				))}
			</ul>
		</>
	);
}
