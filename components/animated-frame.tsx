"use client";

import { motion, useReducedMotion } from "motion/react";

export function AnimatedFrame({
	children,
	className = "",
}: {
	children: React.ReactNode;
	className?: string;
}) {
	const reduceMotion = useReducedMotion();

	return (
		<motion.div
			className={`frame ${className}`.trim()}
			// Do not animate `opacity`: Framer SSR emits `style="opacity:0;…"` for the
			// initial keyframe, so slow mobile networks show a blank page until JS loads.
			// Keep only transform — text stays readable in HTML and first paint.
			initial={reduceMotion ? false : { y: 12, scale: 0.995 }}
			animate={reduceMotion ? undefined : { y: 0, scale: 1 }}
			transition={{
				duration: reduceMotion ? 0 : 0.45,
				ease: [0.25, 0.1, 0.25, 1],
			}}
		>
			{children}
		</motion.div>
	);
}
