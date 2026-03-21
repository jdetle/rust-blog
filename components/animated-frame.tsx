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
			initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.995 }}
			whileInView={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
			viewport={{ once: true, amount: 0.05 }}
			transition={{
				duration: reduceMotion ? 0 : 0.45,
				ease: [0.25, 0.1, 0.25, 1],
			}}
		>
			{children}
		</motion.div>
	);
}

/** Section-level entrance for use inside article content */
export function AnimatedSection({
	children,
	className = "",
	delay = 0,
}: {
	children: React.ReactNode;
	className?: string;
	delay?: number;
}) {
	const reduceMotion = useReducedMotion();

	return (
		<motion.div
			className={className}
			initial={reduceMotion ? false : { opacity: 0, y: 6 }}
			whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
			viewport={{ once: true, amount: 0.15 }}
			transition={{
				duration: reduceMotion ? 0 : 0.4,
				delay: reduceMotion ? 0 : delay,
				ease: "easeOut",
			}}
		>
			{children}
		</motion.div>
	);
}
