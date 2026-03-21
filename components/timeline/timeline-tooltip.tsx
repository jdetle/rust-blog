"use client";

import type { TimelineEvent } from "./timeline";

interface TimelineTooltipProps {
	event: (TimelineEvent & { x: number; y: number }) | null;
	containerWidth: number;
}

export function TimelineTooltip({ event, containerWidth }: TimelineTooltipProps) {
	if (!event) return null;

	const tooltipWidth = 200;
	const flipThreshold = containerWidth - tooltipWidth - 16;
	const leftAligned = event.x < flipThreshold;

	return (
		<foreignObject
			x={leftAligned ? event.x + 12 : event.x - tooltipWidth - 12}
			y={event.y - 8}
			width={tooltipWidth}
			height={80}
			style={{ pointerEvents: "none", overflow: "visible" }}
		>
			<div className="timeline-tooltip">
				<p className="timeline-tooltip-title">{event.title}</p>
				<p className="timeline-tooltip-date">{event.date}</p>
				{event.description && (
					<p className="timeline-tooltip-desc">{event.description}</p>
				)}
			</div>
		</foreignObject>
	);
}
