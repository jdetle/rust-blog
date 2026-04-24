"use client";

import { useMemo } from "react";
import {
	Area,
	Bar,
	BarChart,
	CartesianGrid,
	ComposedChart,
	Legend,
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
import {
	absoluteEventUrl,
	formatPageLabel,
	safeDecodeUriComponent,
} from "@/lib/url-display";

export type AnalyticsUserEvent = {
	event_id: string;
	event_type: string;
	source: string;
	page_url: string;
	event_date: string;
	event_time?: number;
};

function sourceClass(source: string): string {
	const s = source.toLowerCase();
	if (s === "posthog") return "event-viz-source--posthog";
	if (s === "warehouse") return "event-viz-source--warehouse";
	return "event-viz-source--other";
}

function sourceLabel(source: string): string {
	if (source === "posthog") return "PostHog";
	if (source === "warehouse") return "Warehouse";
	return source;
}

function sourceStackKey(source: string): "posthog" | "warehouse" | "other" {
	const s = source.toLowerCase();
	if (s === "posthog") return "posthog";
	if (s === "warehouse") return "warehouse";
	return "other";
}

function getEventTimeMs(e: AnalyticsUserEvent): number {
	if (e.event_time != null) return e.event_time;
	const d = Date.parse(e.event_date);
	return Number.isNaN(d) ? 0 : d;
}

function dayKey(e: AnalyticsUserEvent): string {
	if (e.event_date?.length >= 10) return e.event_date.slice(0, 10);
	const t = getEventTimeMs(e);
	if (t) return new Date(t).toISOString().slice(0, 10);
	return "unknown";
}

function formatWhen(e: AnalyticsUserEvent): string {
	const t = getEventTimeMs(e);
	if (t) {
		return new Date(t).toLocaleString(undefined, {
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	}
	return e.event_date;
}

function isLinkablePageUrl(decoded: string): boolean {
	if (!decoded) return false;
	return decoded.startsWith("/") || /^https?:\/\//i.test(decoded);
}

const tooltipStyle = {
	backgroundColor: WHO_CHART.tooltipBg,
	border: `1px solid ${WHO_CHART.tooltipBorder}`,
	borderRadius: 8,
	color: WHO_CHART.ink,
	fontSize: 12,
};

type StackBucket = { posthog: number; warehouse: number; other: number };

function emptyStack(): StackBucket {
	return { posthog: 0, warehouse: 0, other: 0 };
}

function addToStack(b: StackBucket, source: string, n: number) {
	const k = sourceStackKey(source);
	b[k] += n;
}

export function EventHistoryViz({
	events,
	loading = false,
	error = null,
}: {
	events: AnalyticsUserEvent[];
	loading?: boolean;
	error?: string | null;
}) {
	const reduceMotion = useWhoChartAnimation();

	const siteOrigin =
		typeof window !== "undefined" ? window.location.origin : undefined;

	const sorted = useMemo(() => {
		return [...events].sort((a, b) => getEventTimeMs(b) - getEventTimeMs(a));
	}, [events]);

	const sortedAsc = useMemo(() => {
		return [...events].sort((a, b) => getEventTimeMs(a) - getEventTimeMs(b));
	}, [events]);

	const sources = useMemo(() => {
		const u = new Set(events.map((e) => e.source));
		return [...u].sort();
	}, [events]);

	const hourChartData = useMemo(() => {
		const now = Date.now();
		const start = now - 24 * 60 * 60 * 1000;
		const rows: (StackBucket & { label: string; slot: number })[] = [];
		for (let slot = 0; slot < 24; slot++) {
			rows.push({ ...emptyStack(), label: "", slot });
		}
		for (const e of events) {
			const t = getEventTimeMs(e);
			if (t < start || t > now) continue;
			const idx = Math.min(
				23,
				Math.max(0, Math.floor((t - start) / (60 * 60 * 1000))),
			);
			addToStack(rows[idx], e.source, 1);
		}
		for (let i = 0; i < 24; i++) {
			const hourAgo = 23 - i;
			rows[i].label =
				hourAgo % 6 === 0 ? (hourAgo === 0 ? "now" : `${hourAgo}h`) : "";
		}
		return rows;
	}, [events]);

	const hasHourActivity = useMemo(
		() => hourChartData.some((r) => r.posthog + r.warehouse + r.other > 0),
		[hourChartData],
	);

	const dayChartData = useMemo(() => {
		const m = new Map<string, StackBucket>();
		for (const e of events) {
			const d = dayKey(e);
			if (!m.has(d)) m.set(d, emptyStack());
			const b = m.get(d);
			if (b) addToStack(b, e.source, 1);
		}
		const entries = [...m.entries()]
			.filter(([k]) => k !== "unknown")
			.sort((a, b) => a[0].localeCompare(b[0]))
			.slice(-14);
		return entries.map(([day, b]) => ({
			...b,
			day,
			dayLabel: day.length >= 10 ? day.slice(5) : day,
		}));
	}, [events]);

	const hasDayData = dayChartData.length > 0;

	const cumulativeData = useMemo(() => {
		let n = 0;
		return sortedAsc.map((e) => {
			n += 1;
			return {
				t: getEventTimeMs(e),
				cumulative: n,
			};
		});
	}, [sortedAsc]);

	const showCumulative = cumulativeData.length >= 2;

	if (loading) {
		return (
			<div className="event-history-viz event-history-viz--loading" aria-busy>
				<div className="event-viz-skeleton" aria-hidden>
					<div className="event-viz-skeleton-charts" />
					<div className="event-viz-skeleton-list" />
				</div>
				<p className="event-viz-loading-copy detect-note">Loading events…</p>
			</div>
		);
	}

	if (error) {
		return (
			<div className="event-history-viz event-history-viz--error">
				<p className="detect-note" style={{ color: "var(--error, #dc2626)" }}>
					{error}
				</p>
			</div>
		);
	}

	if (events.length === 0) {
		return (
			<div className="event-history-viz event-history-viz--empty">
				<p className="event-viz-empty-title">No events yet</p>
				<p className="detect-note event-viz-empty-hint">
					When this browser has recorded page views and actions, they will
					appear here as a timeline and in the activity charts above.
				</p>
			</div>
		);
	}

	return (
		<div className="event-history-viz">
			{sources.length > 0 && (
				<section className="event-viz-legend" aria-label="Event sources">
					{sources.map((src) => (
						<span key={src} className={`event-viz-chip ${sourceClass(src)}`}>
							{sourceLabel(src)}
						</span>
					))}
				</section>
			)}

			<section className="event-viz-summary-grid" aria-label="Activity summary">
				{!hasHourActivity && !hasDayData && !showCumulative && (
					<p className="detect-note event-viz-chart-fallback">
						Charts need parseable event times. Your events loaded, but
						timestamps were not usable for the hourly or daily views.
					</p>
				)}
				{hasHourActivity && (
					<div className="event-viz-panel">
						<p className="event-viz-panel-title">Last 24 hours</p>
						<WhoChartBox
							height={200}
							aria-label="Stacked event counts per hour, last 24 hours"
						>
							<BarChart
								data={hourChartData}
								margin={{ top: 6, right: 8, left: 0, bottom: 0 }}
								accessibilityLayer
							>
								<CartesianGrid stroke={WHO_CHART.grid} strokeDasharray="3 3" />
								<XAxis
									dataKey="label"
									tick={WHO_TICK}
									interval={0}
									tickLine={false}
									height={28}
									fontSize={10}
								/>
								<YAxis
									allowDecimals={false}
									width={28}
									tick={WHO_TICK}
									tickLine={false}
									axisLine={false}
								/>
								<Tooltip
									contentStyle={tooltipStyle}
									labelFormatter={(_, p) => {
										const s = p?.[0]?.payload?.slot;
										if (typeof s === "number")
											return `~${23 - s}h from window start`;
										return "Hour";
									}}
									formatter={(value, name) => [value, name]}
								/>
								<Legend
									wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
									formatter={(v) =>
										v === "posthog"
											? "PostHog"
											: v === "warehouse"
												? "Warehouse"
												: "Other"
									}
								/>
								<Bar
									dataKey="posthog"
									stackId="a"
									fill={WHO_CHART.posthog}
									isAnimationActive={reduceMotion}
									radius={[0, 0, 0, 0]}
								/>
								<Bar
									dataKey="warehouse"
									stackId="a"
									fill={WHO_CHART.warehouse}
									isAnimationActive={reduceMotion}
								/>
								<Bar
									dataKey="other"
									stackId="a"
									fill={WHO_CHART.other}
									isAnimationActive={reduceMotion}
									radius={[2, 2, 0, 0]}
								/>
							</BarChart>
						</WhoChartBox>
					</div>
				)}

				{hasDayData && (
					<div className="event-viz-panel">
						<p className="event-viz-panel-title">By day</p>
						<WhoChartBox
							height={200}
							aria-label="Stacked event counts by calendar day"
						>
							<BarChart
								data={dayChartData}
								margin={{ top: 6, right: 8, left: 0, bottom: 0 }}
								accessibilityLayer
							>
								<CartesianGrid stroke={WHO_CHART.grid} strokeDasharray="3 3" />
								<XAxis
									dataKey="dayLabel"
									tick={WHO_TICK}
									interval="preserveStartEnd"
									angle={-20}
									textAnchor="end"
									height={48}
									tickLine={false}
								/>
								<YAxis
									allowDecimals={false}
									width={28}
									tick={WHO_TICK}
									tickLine={false}
									axisLine={false}
								/>
								<Tooltip
									contentStyle={tooltipStyle}
									labelFormatter={(_, p) => p?.[0]?.payload?.day ?? "Day"}
								/>
								<Bar
									dataKey="posthog"
									stackId="d"
									fill={WHO_CHART.posthog}
									isAnimationActive={reduceMotion}
								/>
								<Bar
									dataKey="warehouse"
									stackId="d"
									fill={WHO_CHART.warehouse}
									isAnimationActive={reduceMotion}
								/>
								<Bar
									dataKey="other"
									stackId="d"
									fill={WHO_CHART.other}
									isAnimationActive={reduceMotion}
									radius={[2, 2, 0, 0]}
								/>
							</BarChart>
						</WhoChartBox>
					</div>
				)}

				{showCumulative && (
					<div className="event-viz-panel event-viz-panel--cumulative">
						<p className="event-viz-panel-title">
							Cumulative events (oldest → newest)
						</p>
						<WhoChartBox
							height={160}
							aria-label="Cumulative event count over time"
						>
							<ComposedChart
								data={cumulativeData}
								margin={{ top: 6, right: 8, left: 0, bottom: 0 }}
								accessibilityLayer
							>
								<CartesianGrid stroke={WHO_CHART.grid} strokeDasharray="3 3" />
								<XAxis
									type="number"
									dataKey="t"
									domain={["dataMin", "dataMax"]}
									tickFormatter={(ts) => {
										const d = new Date(Number(ts));
										return `${d.getMonth() + 1}/${d.getDate()}`;
									}}
									tick={WHO_TICK}
									tickLine={false}
									fontSize={10}
								/>
								<YAxis
									allowDecimals={false}
									width={32}
									tick={WHO_TICK}
									tickLine={false}
									axisLine={false}
								/>
								<Tooltip
									contentStyle={tooltipStyle}
									labelFormatter={(t) => new Date(Number(t)).toLocaleString()}
									formatter={(v) => [`${v} events`, "Total"]}
								/>
								<Area
									type="monotone"
									dataKey="cumulative"
									stroke={WHO_CHART.posthog}
									fill="rgba(107, 125, 94, 0.12)"
									strokeWidth={2}
									isAnimationActive={reduceMotion}
								/>
							</ComposedChart>
						</WhoChartBox>
					</div>
				)}
			</section>

			<section className="event-viz-feed" aria-label="Event feed">
				<p className="event-viz-feed-heading">Recent events</p>
				<ol className="event-viz-timeline">
					{sorted.map((e) => {
						const decodedUrl = e.page_url
							? safeDecodeUriComponent(e.page_url)
							: "";
						const href =
							e.page_url && siteOrigin
								? absoluteEventUrl(e.page_url, siteOrigin)
								: "";
						const showLink = Boolean(href && isLinkablePageUrl(decodedUrl));
						const pageLabel = e.page_url
							? formatPageLabel(e.page_url, siteOrigin)
							: "";

						return (
							<li key={e.event_id} className="event-viz-timeline-item">
								<article
									className="event-viz-card"
									aria-label={`${e.event_type} ${sourceLabel(e.source)}`}
								>
									<header className="event-viz-card-head">
										<span className="event-viz-event-name">{e.event_type}</span>
										{showLink && href ? (
											<a
												className="event-viz-link"
												href={href}
												target="_blank"
												rel="noopener noreferrer"
												aria-label={`Open page for ${e.event_type}`}
											>
												↗
											</a>
										) : null}
									</header>
									<div className="event-viz-meta">
										<span
											className={`event-viz-chip event-viz-chip--inline ${sourceClass(e.source)}`}
										>
											{sourceLabel(e.source)}
										</span>
										<time
											className="event-viz-when"
											dateTime={
												getEventTimeMs(e)
													? new Date(getEventTimeMs(e)).toISOString()
													: undefined
											}
										>
											{formatWhen(e)}
										</time>
									</div>
									{pageLabel ? (
										<div className="event-viz-url" title={decodedUrl}>
											{pageLabel}
										</div>
									) : null}
								</article>
							</li>
						);
					})}
				</ol>
			</section>
		</div>
	);
}
