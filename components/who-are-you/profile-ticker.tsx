"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { formatPageLabel } from "@/lib/url-display";

export interface TickerEvent {
	event_id: string;
	event_type: string;
	source: string;
	page_url: string;
	event_date: string;
	event_time?: number;
}

function formatEventType(eventType: string): string {
	if (eventType === "pageview" || eventType === "$pageview") return "Page view";
	return eventType.replaceAll("_", " ");
}

function formatSource(source: string): string {
	if (source === "posthog") return "PostHog";
	if (source === "warehouse") return "Warehouse";
	return source;
}

function formatTimestamp(event: TickerEvent): string {
	const eventTime = event.event_time ?? Date.parse(event.event_date);
	if (!eventTime || Number.isNaN(eventTime)) return "time unknown";
	return new Date(eventTime).toLocaleTimeString([], {
		hour: "numeric",
		minute: "2-digit",
	});
}

interface ProfileTickerProps {
	events: TickerEvent[];
	loading?: boolean;
}

/**
 * Vertical event ticker that slowly lifts a bounded window of events upward.
 */
export function ProfileTicker({ events, loading = false }: ProfileTickerProps) {
	const reduceMotion = useReducedMotion();
	const [visibleCount, setVisibleCount] = useState(0);

	const tickerItems = useMemo(
		() =>
			events.map((event) => {
				const origin =
					typeof window !== "undefined" ? window.location.origin : undefined;
				return {
					id: event.event_id,
					type: formatEventType(event.event_type),
					source: formatSource(event.source),
					page: event.page_url
						? formatPageLabel(event.page_url, origin)
						: "Unknown page",
					when: formatTimestamp(event),
				};
			}),
		[events],
	);

	useEffect(() => {
		if (tickerItems.length === 0) {
			setVisibleCount(0);
			return;
		}
		const target = loading
			? Math.min(visibleCount + 1, tickerItems.length)
			: tickerItems.length;
		if (visibleCount >= target) return;
		const timeout = setTimeout(() => {
			setVisibleCount((count) => Math.min(count + 1, target));
		}, 350);
		return () => clearTimeout(timeout);
	}, [tickerItems.length, visibleCount, loading]);

	const displayItems = tickerItems.slice(0, visibleCount);
	const hasContent = displayItems.length > 0;

	if (!hasContent && !loading) {
		return (
			<div className="profile-ticker-wrap profile-ticker-wrap--empty">
				<p className="profile-ticker-empty">
					Stored events will appear here as you browse.
				</p>
			</div>
		);
	}

	return (
		<div className="profile-ticker-wrap" aria-live="polite">
			<div
				className={`profile-ticker ${reduceMotion ? "profile-ticker--reduced" : ""}`}
			>
				<ul
					className={`profile-ticker-track ${
						hasContent ? "profile-ticker-track--active" : ""
					}`}
				>
					{!hasContent && loading ? (
						<li className="profile-ticker-item profile-ticker-pulse">
							<p className="profile-ticker-row-top">Gathering signals...</p>
							<p className="profile-ticker-row-bottom">
								Waiting for stored events to arrive.
							</p>
						</li>
					) : null}
					{displayItems.map((item) => (
						<li key={item.id} className="profile-ticker-item">
							<div className="profile-ticker-row-top">
								<span className="profile-ticker-type">{item.type}</span>
								<span className="profile-ticker-time">{item.when}</span>
							</div>
							<div className="profile-ticker-row-bottom">
								<span className="profile-ticker-page">{item.page}</span>
								<span className="profile-ticker-source">{item.source}</span>
							</div>
						</li>
					))}
					{hasContent && !reduceMotion
						? displayItems.map((item) => (
								<li
									key={`${item.id}-duplicate`}
									className="profile-ticker-item profile-ticker-item--duplicate"
									aria-hidden="true"
								>
									<div className="profile-ticker-row-top">
										<span className="profile-ticker-type">{item.type}</span>
										<span className="profile-ticker-time">{item.when}</span>
									</div>
									<div className="profile-ticker-row-bottom">
										<span className="profile-ticker-page">{item.page}</span>
										<span className="profile-ticker-source">{item.source}</span>
									</div>
								</li>
							))
						: null}
				</ul>
			</div>
		</div>
	);
}
