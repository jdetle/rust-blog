"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useTimelineScales } from "./use-timeline-scales";
import { TimelineNode } from "./timeline-node";
import { TimelineTooltip } from "./timeline-tooltip";

export interface TimelineEvent {
	id: string;
	title: string;
	date: string;
	category?: string;
	description?: string;
}

interface TimelineProps {
	events: TimelineEvent[];
	height?: number;
	className?: string;
	/** Optional: ID of the event to highlight (for scrollytelling) */
	activeEventId?: string | null;
}

export function Timeline({
	events,
	height = 200,
	className = "",
	activeEventId = null,
}: TimelineProps) {
	const reduceMotion = useReducedMotion();
	const containerRef = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(800);
	const [hoveredId, setHoveredId] = useState<string | null>(null);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const ro = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (entry) setWidth(entry.contentRect.width);
		});
		ro.observe(el);
		setWidth(el.clientWidth);
		return () => ro.disconnect();
	}, []);

	const { ticks, formatTick, positioned, xScale } = useTimelineScales(events, {
		width,
		height,
	});

	const activeId = activeEventId ?? hoveredId;
	const activeEvent = activeId ? positioned.find((e) => e.id === activeId) ?? null : null;

	const handleHover = useCallback((id: string | null) => {
		setHoveredId(id);
	}, []);

	const axisY = height - 36;

	return (
		<div ref={containerRef} className={`timeline-container ${className}`.trim()}>
			<motion.svg
				viewBox={`0 0 ${width} ${height}`}
				width="100%"
				height={height}
				role="list"
				aria-label="Timeline"
				initial={reduceMotion ? false : { opacity: 0 }}
				whileInView={reduceMotion ? undefined : { opacity: 1 }}
				viewport={{ once: true, amount: 0.2 }}
				transition={{ duration: reduceMotion ? 0 : 0.5 }}
			>
				{/* Axis line */}
				<line
					x1={24}
					y1={axisY}
					x2={width - 24}
					y2={axisY}
					stroke="var(--line-strong)"
					strokeWidth={1}
				/>
				{/* Tick marks and labels */}
				{ticks.map((tick) => {
					const x = positioned.length > 0 ? xScale(tick) : 24;
					return (
						<g key={tick.toISOString()}>
							<line
								x1={x}
								y1={axisY - 4}
								x2={x}
								y2={axisY + 4}
								stroke="var(--line-strong)"
								strokeWidth={1}
							/>
							<text
								x={x}
								y={axisY + 20}
								textAnchor="middle"
								className="timeline-tick-label"
								fill="var(--muted-ink)"
							>
								{formatTick(tick)}
							</text>
						</g>
					);
				})}
				{/* Event nodes */}
				{positioned.map((event, i) => (
					<TimelineNode
						key={event.id}
						event={event}
						index={i}
						activeId={activeId}
						onHover={handleHover}
					/>
				))}
				{/* Tooltip */}
				<TimelineTooltip event={activeEvent} containerWidth={width} />
			</motion.svg>
		</div>
	);
}
