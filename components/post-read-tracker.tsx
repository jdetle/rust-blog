"use client";

import posthog from "posthog-js";
import { useEffect } from "react";

export function PostReadTracker({
	slug,
	title,
}: {
	slug: string;
	title: string;
}) {
	useEffect(() => {
		posthog.capture("post_read", { slug, title });
	}, [slug, title]);

	return null;
}
