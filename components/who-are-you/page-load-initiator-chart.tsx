"use client";

import { useEffect, useMemo, useState } from "react";
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
 * Live count of Resource Timing entries by `initiatorType` for this page load
 * (session so far). Not a click heatmap — real request mix on this visit.
 */
export function PageLoadInitiatorChart() {
	const [rows, setRows] = useState<{ type: string; count: number }[]>([]);
	const [ready, setReady] = useState(false);
	const animate = useWhoChartAnimation();

	useEffect(() => {
		const run = () => {
			try {
				const entries = performance.getEntriesByType(
					"resource",
				) as PerformanceResourceTiming[];
				const m = new Map<string, number>();
				for (const e of entries) {
					const t = e.initiatorType || "unknown";
					m.set(t, (m.get(t) ?? 0) + 1);
				}
				const list = [...m.entries()]
					.map(([type, count]) => ({ type, count }))
					.sort((a, b) => b.count - a.count);
				setRows(list);
			} catch {
				setRows([]);
			}
			setReady(true);
		};
		const t = window.setTimeout(run, 1800);
		return () => window.clearTimeout(t);
	}, []);

	const data = useMemo(
		() =>
			rows.map((r) => ({
				...r,
				label:
					r.type === "xmlhttprequest"
						? "XHR / fetch"
						: r.type === "script"
							? "Script"
							: r.type === "img"
								? "Image"
								: r.type === "link"
									? "Stylesheet / link"
									: r.type === "beacon"
										? "Beacon"
										: r.type === "css"
											? "CSS"
											: r.type.charAt(0).toUpperCase() + r.type.slice(1),
			})),
		[rows],
	);

	if (!ready) {
		return (
			<p className="detect-note loading-pulse">
				Measuring request types&hellip;
			</p>
		);
	}

	if (data.length === 0) {
		return (
			<p className="detect-note">
				No resource timing entries yet. Reload to capture a fuller mix.
			</p>
		);
	}

	return (
		<div className="initiator-chart-wrap">
			<p className="detect-note initiator-chart-note">
				This page load (so far): how many network resources were requested by
				type (script, image, XHR, etc.) &mdash; from the browser&apos;s Resource
				Timing list, not a session-replay heatmap.
			</p>
			<WhoChartBox
				height={Math.min(380, 40 + data.length * 28)}
				aria-label="Resource count by initiator type for this page load"
			>
				<BarChart
					layout="vertical"
					data={data}
					margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
					barSize={20}
				>
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
						width={120}
						tick={{ fontSize: 10, fill: "rgba(42, 35, 28, 0.65)" }}
						interval={0}
						tickLine={false}
						axisLine={false}
					/>
					<Tooltip
						contentStyle={tooltipStyle}
						formatter={(v) => [`${v} resources`, "Count"]}
						labelFormatter={(_l, p) =>
							(p?.[0]?.payload as { type?: string })?.type ?? ""
						}
					/>
					<Bar
						dataKey="count"
						fill={WHO_CHART.warehouse}
						isAnimationActive={animate}
						radius={[0, 3, 3, 0]}
					/>
				</BarChart>
			</WhoChartBox>
		</div>
	);
}
