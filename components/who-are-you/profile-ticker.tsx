"use client";

import { useEffect, useState } from "react";
import { formatPageLabel } from "@/lib/url-display";

export interface TickerEvent {
	event_id: string;
	event_type: string;
	source: string;
	page_url: string;
	event_date: string;
}

function formatTickerItem(e: TickerEvent): string {
	const label =
		e.event_type === "pageview" || e.event_type === "$pageview"
			? "Viewed"
			: e.event_type;
	if (!e.page_url) return label;
	const origin =
		typeof window !== "undefined" ? window.location.origin : undefined;
	const short = formatPageLabel(e.page_url, origin);
	return `${label} ${short}`;
}

interface ProfileTickerProps {
	events: TickerEvent[];
	/** Whether data is still loading (ticker shows building state) */
	loading?: boolean;
}

/**
 * Stock-ticker style display of analytics events.
 * The more interaction, the more items — picture builds as the user browses.
 */
export function ProfileTicker({ events, loading = false }: ProfileTickerProps) {
	const [visibleCount, setVisibleCount] = useState(0);

	const tickerItems = events.map((e) => ({
		id: e.event_id,
		text: formatTickerItem(e),
	}));
	const displayItems = tickerItems.slice(0, visibleCount);

	// Reveal items progressively (picture building)
	useEffect(() => {
		if (tickerItems.length === 0) return;
		const target = loading
			? Math.min(visibleCount + 1, tickerItems.length)
			: tickerItems.length;
		if (visibleCount >= target) return;
		const t = setTimeout(
			() => setVisibleCount((c) => Math.min(c + 1, target)),
			350,
		);
		return () => clearTimeout(t);
	}, [tickerItems.length, visibleCount, loading]);

	const hasContent = displayItems.length > 0;

	return (
		<div className="profile-ticker-wrap" aria-live="polite">
			<div className="profile-ticker">
				<div className="profile-ticker-track">
					{!hasContent && loading && (
						<span className="profile-ticker-item profile-ticker-pulse">
							Gathering signals&hellip;
						</span>
					)}
					{displayItems.map((item) => (
						<span key={item.id} className="profile-ticker-item">
							{item.text}
						</span>
					))}
					{/* Duplicate for seamless marquee loop */}
					{hasContent &&
						displayItems.map((item) => (
							<span key={`dup-${item.id}`} className="profile-ticker-item">
								{item.text}
							</span>
						))}
				</div>
			</div>
		</div>
	);
}
