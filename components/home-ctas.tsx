"use client";

import Link from "next/link";
import posthog from "posthog-js";
import type { HeroVariant } from "@/components/home-hero-ab";
import { HOME_HERO_FLAG } from "@/components/home-hero-ab";

interface HomeCtasProps {
	/** Passed from HomeHeroAbTest so the primary CTA matches the experiment variant. */
	variant?: HeroVariant;
}

export function HomeCtas({ variant = "treatment" }: HomeCtasProps) {
	const capture = (label: string) => {
		posthog.capture("cta_clicked", {
			label,
			[`$feature/${HOME_HERO_FLAG}`]: variant,
		});
	};

	const workWithMePrimary = variant !== "control";

	return (
		<div className="cta-row">
			<Link
				className={`btn ${workWithMePrimary ? "btn-primary" : "btn-secondary"}`}
				href="/work-with-me"
				onClick={() => capture("work_with_me")}
			>
				Work with me
			</Link>
			<Link
				className={`btn ${workWithMePrimary ? "btn-secondary" : "btn-primary"}`}
				href="/posts"
				onClick={() => capture("read_blog")}
			>
				Read the blog
			</Link>
			<Link
				className="btn btn-secondary"
				href="/who-are-you"
				onClick={() => capture("who_are_you")}
			>
				Who are you?
			</Link>
			<a
				className="btn btn-secondary"
				href="https://www.linkedin.com/in/jdetle/"
				target="_blank"
				rel="noopener noreferrer"
				onClick={() => capture("linkedin")}
			>
				LinkedIn
			</a>
			<a
				className="btn btn-secondary"
				href="https://github.com/jdetle"
				target="_blank"
				rel="noopener noreferrer"
				onClick={() => capture("github")}
			>
				GitHub
			</a>
		</div>
	);
}
