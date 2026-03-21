"use client";

import { useEffect, useRef, useState } from "react";
import { Timeline, type TimelineEvent } from "./timeline";

interface ScrollStep {
	eventId: string;
	content: React.ReactNode;
}

interface ScrollyTimelineProps {
	events: TimelineEvent[];
	steps: ScrollStep[];
	timelineHeight?: number;
}

/**
 * Sticky-chart scrollytelling: the timeline sticks while prose steps scroll
 * past, each step highlighting a specific event on the timeline.
 */
export function ScrollyTimeline({
	events,
	steps,
	timelineHeight = 220,
}: ScrollyTimelineProps) {
	const [activeEventId, setActiveEventId] = useState<string | null>(
		steps[0]?.eventId ?? null,
	);
	const stepsRef = useRef<(HTMLDivElement | null)[]>([]);

	useEffect(() => {
		const observers: IntersectionObserver[] = [];

		for (let i = 0; i < steps.length; i++) {
			const el = stepsRef.current[i];
			if (!el) continue;

			const observer = new IntersectionObserver(
				([entry]) => {
					if (entry.isIntersecting) {
						setActiveEventId(steps[i].eventId);
					}
				},
				{ rootMargin: "-40% 0px -40% 0px", threshold: 0.1 },
			);
			observer.observe(el);
			observers.push(observer);
		}

		return () => {
			for (const obs of observers) obs.disconnect();
		};
	}, [steps]);

	return (
		<div className="scrolly-timeline">
			<div className="scrolly-timeline-sticky">
				<Timeline
					events={events}
					height={timelineHeight}
					activeEventId={activeEventId}
				/>
			</div>
			<div className="scrolly-timeline-steps" role="list">
				{steps.map((step, i) => (
					<div
						key={step.eventId}
						ref={(el) => { stepsRef.current[i] = el; }}
						className={`scrolly-step${activeEventId === step.eventId ? " scrolly-step-active" : ""}`}
						role="listitem"
					>
						{step.content}
					</div>
				))}
			</div>
		</div>
	);
}
