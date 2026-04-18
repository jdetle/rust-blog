"use client";

import posthog from "posthog-js";
import { useEffect, useState } from "react";
import { HomeCtas } from "@/components/home-ctas";
import { HomeFingerprintAvatar } from "@/components/home-fingerprint-avatar";

/**
 * Feature flag key used in PostHog for this experiment.
 * Flag variants:
 *   "treatment" (default / fallback) — agentic-practice hero
 *   "control"                         — original commerce-reliability hero
 *
 * Create in PostHog: Experiments → New experiment → key "home-hero-variant",
 * two variants "control" (50%) and "treatment" (50%), primary metric
 * cta_clicked where properties.label = 'work_with_me'.
 */
export const HOME_HERO_FLAG = "home-hero-variant";
export type HeroVariant = "treatment" | "control";

interface HeroContent {
	eyebrow: string;
	headline: string;
	lede: React.ReactNode;
}

const TREATMENT_HERO: HeroContent = {
	eyebrow: "Agentic Engineering \u00b7 Production Reliability",
	headline:
		"I install the discipline that makes AI agents reliable in production.",
	lede: (
		<>
			Rules-as-memory, parallel agent orchestration through git worktrees,
			adversarial review before every push, and grounding for user-facing
			agents. Anchored in seven years of shipping customer-facing software where
			downtime costs real money &mdash; the dashboard and account surfaces
			behind $200M+ in annual revenue at GoDaddy, and cloud infrastructure for
			nine-figure consulting engagements at PwC (via Kunai).
		</>
	),
};

const CONTROL_HERO: HeroContent = {
	eyebrow: "Senior Software Engineer \u00b7 Reliability & Growth",
	headline: "I build the systems behind the buy button.",
	lede: (
		<>
			Seven years of shipping customer-facing software where downtime costs real
			money. At GoDaddy I helped evolve the dashboard and account surfaces
			behind $200M+ in annual revenue, cutting p95 latency and improving
			experiment quality across millions of sessions. At PwC (via Kunai) I build
			cloud infrastructure for nine-figure consulting engagements.
		</>
	),
};

export function HomeHeroAbTest() {
	const [variant, setVariant] = useState<HeroVariant>("treatment");

	useEffect(() => {
		const resolveVariant = () => {
			const flag = posthog.getFeatureFlag(HOME_HERO_FLAG);
			if (flag === "control") {
				setVariant("control");
			} else {
				setVariant("treatment");
			}
		};

		resolveVariant();

		const unsub = posthog.onFeatureFlags(resolveVariant);
		return () => {
			if (typeof unsub === "function") unsub();
		};
	}, []);

	const content = variant === "control" ? CONTROL_HERO : TREATMENT_HERO;

	return (
		<section className="home-hero" aria-labelledby="home-hero-heading">
			<p className="eyebrow">{content.eyebrow}</p>
			<div className="home-hero-headline">
				<h1 id="home-hero-heading">{content.headline}</h1>
				<HomeFingerprintAvatar />
			</div>
			<p className="lede">{content.lede}</p>
			<HomeCtas variant={variant} />
		</section>
	);
}
