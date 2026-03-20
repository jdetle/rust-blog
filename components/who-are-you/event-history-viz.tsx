"use client";

import { motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";
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

export function EventHistoryViz({ events }: { events: AnalyticsUserEvent[] }) {
	const reduceMotion = useReducedMotion();

	const siteOrigin =
		typeof window !== "undefined" ? window.location.origin : undefined;

	const sorted = useMemo(() => {
		return [...events].sort((a, b) => getEventTimeMs(b) - getEventTimeMs(a));
	}, [events]);

	const countsByDay = useMemo(() => {
		const m = new Map<string, number>();
		for (const e of events) {
			const day = dayKey(e);
			m.set(day, (m.get(day) ?? 0) + 1);
		}
		return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
	}, [events]);

	const maxDay = Math.max(1, ...countsByDay.map(([, n]) => n));

	const sources = useMemo(() => {
		const u = new Set(events.map((e) => e.source));
		return [...u].sort();
	}, [events]);

	return (
		<div className="event-history-viz">
			<section className="event-viz-legend" aria-label="Event sources">
				{sources.map((src) => (
					<span key={src} className={`event-viz-chip ${sourceClass(src)}`}>
						{sourceLabel(src)}
					</span>
				))}
			</section>

			{countsByDay.length > 0 && (
				<div className="event-viz-density">
					<div className="event-viz-density-label">Activity by day</div>
					<div
						className="event-viz-density-bars"
						role="img"
						aria-label="Event count per day"
					>
						{countsByDay.map(([day, count]) => (
							<div
								key={day}
								className="event-viz-density-cell"
								title={`${day}: ${count} event${count === 1 ? "" : "s"}`}
							>
								<div className="event-viz-density-bar-wrap">
									<motion.div
										className="event-viz-density-bar"
										initial={reduceMotion ? false : { height: "0%" }}
										animate={{
											height: `${Math.max(10, (count / maxDay) * 100)}%`,
										}}
										transition={{
											type: "spring",
											stiffness: 320,
											damping: 26,
										}}
									/>
								</div>
								<span className="event-viz-density-day">
									{day.length >= 10 ? day.slice(5) : day}
								</span>
							</div>
						))}
					</div>
				</div>
			)}

			<motion.ol className="event-viz-timeline" initial={false}>
				{sorted.map((e, i) => {
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
						<motion.li
							key={e.event_id}
							className="event-viz-row"
							initial={reduceMotion ? false : { opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{
								duration: 0.28,
								delay: reduceMotion ? 0 : Math.min(i * 0.035, 0.55),
							}}
						>
							<div className="event-viz-rail" aria-hidden="true">
								<div className={`event-viz-dot ${sourceClass(e.source)}`} />
								{i < sorted.length - 1 ? (
									<div className="event-viz-connector" />
								) : null}
							</div>
							<div className="event-viz-card">
								<div className="event-viz-card-head">
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
								</div>
								<div className="event-viz-meta">
									<span className={`event-viz-chip ${sourceClass(e.source)}`}>
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
							</div>
						</motion.li>
					);
				})}
			</motion.ol>
		</div>
	);
}
