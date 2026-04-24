"use client";

import { useReducedMotion } from "motion/react";
import type { ReactElement } from "react";
import { ResponsiveContainer } from "recharts";

/** Design-token aligned colors for who-are-you charts (see posts/blog.css). */
export const WHO_CHART = {
	posthog: "#6b7d5e",
	warehouse: "#8b5a3c",
	other: "#c9a227",
	grid: "rgba(90, 98, 72, 0.22)",
	axis: "rgba(42, 35, 28, 0.55)",
	ink: "#2a231c",
	tooltipBg: "rgba(242, 236, 224, 0.96)",
	tooltipBorder: "rgba(42, 35, 28, 0.12)",
} as const;

export const WHO_TICK = {
	fill: WHO_CHART.axis,
	fontSize: 11,
} as const;

export function useWhoChartAnimation(): boolean {
	const reduce = useReducedMotion();
	return !reduce;
}

/**
 * Recharts `ResponsiveContainer` needs a single chart child. Pass height in px
 * so layout is stable in flex/grid and during SSR.
 */
export function WhoChartBox({
	height,
	className,
	children,
	"aria-label": ariaLabel,
}: {
	height: number;
	className?: string;
	children: ReactElement;
	"aria-label"?: string;
}): ReactElement {
	return (
		<div
			className={`who-recharts-root${className ? ` ${className}` : ""}`}
			style={{ width: "100%", height, minWidth: 0 }}
			role="img"
			aria-label={ariaLabel}
		>
			<ResponsiveContainer width="100%" height="100%">
				{children}
			</ResponsiveContainer>
		</div>
	);
}
