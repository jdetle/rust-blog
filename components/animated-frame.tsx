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
			initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.995 }}
			whileInView={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
			viewport={{ once: true, amount: 0.05 }}
			transition={{
				duration: reduceMotion ? 0 : 0.35,
				ease: "easeOut",
			}}
		>
			{children}
		</motion.div>
	);
}
