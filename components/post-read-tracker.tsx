"use client";

import posthog from "posthog-js";
import { useEffect } from "react";
import { MetaEvents } from "@/lib/meta-pixel";

export function PostReadTracker({
	slug,
	title,
}: {
	slug: string;
	title: string;
}) {
	useEffect(() => {
		posthog.capture("post_read", { slug, title });
		MetaEvents.trackViewContent({
			content_ids: [slug],
			content_type: "article",
			content_name: title,
		});
	}, [slug, title]);

	return null;
}
