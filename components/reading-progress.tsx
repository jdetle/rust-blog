"use client";

import { motion, useScroll, useReducedMotion } from "motion/react";

export function ReadingProgress() {
	const reduceMotion = useReducedMotion();
	const { scrollYProgress } = useScroll();

	if (reduceMotion) return null;

	return (
		<motion.div
			className="reading-progress"
			style={{ scaleX: scrollYProgress, transformOrigin: "left" }}
			aria-hidden="true"
		/>
	);
}
