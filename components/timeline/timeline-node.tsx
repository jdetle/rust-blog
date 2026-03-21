"use client";

import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import type { TimelineEvent } from "./timeline";

const CATEGORY_COLORS: Record<string, string> = {
	feature: "var(--hazel-sage)",
	fix: "var(--terracotta)",
	milestone: "var(--mustard)",
	release: "var(--hazel-bark)",
};

function colorFor(category?: string): string {
	return (category && CATEGORY_COLORS[category]) || "var(--olive)";
}

interface TimelineNodeProps {
	event: TimelineEvent & { x: number; y: number };
	index: number;
	activeId: string | null;
	onHover: (id: string | null) => void;
}

export function TimelineNode({ event, index, activeId, onHover }: TimelineNodeProps) {
	const reduceMotion = useReducedMotion();
	const isActive = activeId === event.id;
	const color = colorFor(event.category);
	const [isFocused, setIsFocused] = useState(false);

	return (
		<motion.g
			initial={reduceMotion ? false : { opacity: 0, scale: 0.6 }}
			whileInView={reduceMotion ? undefined : { opacity: 1, scale: 1 }}
			viewport={{ once: true, amount: 0.3 }}
			transition={{
				duration: reduceMotion ? 0 : 0.4,
				delay: reduceMotion ? 0 : index * 0.06,
				ease: "easeOut",
			}}
			onMouseEnter={() => onHover(event.id)}
			onMouseLeave={() => onHover(null)}
			onFocus={() => { onHover(event.id); setIsFocused(true); }}
			onBlur={() => { onHover(null); setIsFocused(false); }}
			role="listitem"
			aria-label={`${event.title}, ${event.date}`}
			tabIndex={0}
			style={{ cursor: "pointer", outline: "none" }}
		>
			{/* Vertical tick line from axis to node */}
			<line
				x1={event.x}
				y1={event.y + 6}
				x2={event.x}
				y2={event.y + 28}
				stroke={color}
				strokeWidth={1}
				strokeOpacity={0.3}
			/>
			{/* Main circle */}
			<circle
				cx={event.x}
				cy={event.y}
				r={isActive || isFocused ? 7 : 5}
				fill={color}
				stroke="var(--paper)"
				strokeWidth={2}
				style={{ transition: "r 200ms ease" }}
			/>
			{/* Label (always visible) */}
			<text
				x={event.x}
				y={event.y - 12}
				textAnchor="middle"
				className="timeline-node-label"
				fill="var(--ink)"
			>
				{event.title.length > 24 ? `${event.title.slice(0, 22)}…` : event.title}
			</text>
		</motion.g>
	);
}
