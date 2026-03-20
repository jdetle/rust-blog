"use client";

import { useMemo } from "react";
import { scaleTime, scaleLinear } from "d3-scale";
import { timeFormat } from "d3-time-format";
import type { TimelineEvent } from "./timeline";

interface ScaleConfig {
	width: number;
	height: number;
	padding: { top: number; right: number; bottom: number; left: number };
}

const defaultPadding = { top: 24, right: 24, bottom: 40, left: 24 };

export function useTimelineScales(
	events: TimelineEvent[],
	config: Partial<ScaleConfig> = {},
) {
	const { width = 800, height = 200, padding = defaultPadding } = config;

	return useMemo(() => {
		if (events.length === 0) {
			const now = new Date();
			const xScale = scaleTime()
				.domain([now, now])
				.range([padding.left, width - padding.right]);
			const yScale = scaleLinear()
				.domain([0, 1])
				.range([padding.top + 20, height - padding.bottom - 16]);
			const formatTick = timeFormat("%b %Y");
			const formatShort = timeFormat("%b %d");
			return { xScale, yScale, ticks: [], formatTick, formatShort, positioned: [], categories: [] };
		}

		const dates = events.map((e) => new Date(e.date));
		const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
		const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));

		const domainPad = (maxDate.getTime() - minDate.getTime()) * 0.05 || 86400000;
		const paddedMin = new Date(minDate.getTime() - domainPad);
		const paddedMax = new Date(maxDate.getTime() + domainPad);

		const xScale = scaleTime()
			.domain([paddedMin, paddedMax])
			.range([padding.left, width - padding.right]);

		const categories = [...new Set(events.map((e) => e.category).filter(Boolean))];

		const yScale = scaleLinear()
			.domain([0, Math.max(categories.length - 1, 1)])
			.range([padding.top + 20, height - padding.bottom - 16]);

		const formatTick = timeFormat("%b %Y");
		const formatShort = timeFormat("%b %d");

		const ticks = xScale.ticks(Math.min(6, Math.max(2, Math.floor(width / 140))));

		const positioned = events.map((event) => {
			const date = new Date(event.date);
			const catIndex = event.category ? categories.indexOf(event.category) : 0;
			return {
				...event,
				x: xScale(date),
				y: yScale(Math.max(catIndex, 0)),
			};
		});

		return { xScale, yScale, ticks, formatTick, formatShort, positioned, categories };
	}, [events, width, height, padding]);
}
