import posthog from "posthog-js";
import { sendMetaEvent } from "./meta-pixel";

type SharePlatform =
	| "twitter"
	| "linkedin"
	| "reddit"
	| "hackernews"
	| "facebook"
	| "email"
	| "copy_link";

interface ShareEventProps {
	platform: SharePlatform;
	slug: string;
	title: string;
	shareUrl: string;
	pageUrl: string;
	readingTimeSeconds: number;
	scrollDepthPct: number;
	referrerType: string;
	canvasFingerprint: string;
	deviceType: string;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://jdetle.com";

export function buildShareUrl(slug: string, platform: SharePlatform): string {
	const base = new URL(`/posts/${encodeURIComponent(slug)}`, SITE_URL);
	base.searchParams.set("utm_source", platform);
	base.searchParams.set("utm_medium", "social");
	base.searchParams.set("utm_campaign", "post_share");
	base.searchParams.set("utm_content", slug);
	return base.href;
}

export function trackShareEvent(props: ShareEventProps): void {
	if (typeof window === "undefined") return;

	const {
		platform,
		slug,
		title,
		shareUrl,
		pageUrl,
		readingTimeSeconds,
		scrollDepthPct,
		referrerType,
		canvasFingerprint,
		deviceType,
	} = props;

	// PostHog — richest event, includes all auto-props ($browser, $os, $geoip, distinct_id)
	posthog.capture("post_shared", {
		share_platform: platform,
		post_slug: slug,
		post_title: title,
		share_url: shareUrl,
		page_url: pageUrl,
		reading_time_seconds: readingTimeSeconds,
		scroll_depth_pct: scrollDepthPct,
		referrer_type: referrerType,
		canvas_fingerprint: canvasFingerprint,
		device_type: deviceType,
	});

	// GA4 / gtag — uses the recommended "share" event name
	const gtag = (window as { gtag?: (...args: unknown[]) => void }).gtag;
	if (gtag) {
		gtag("event", "share", {
			method: platform,
			content_type: "blog_post",
			item_id: slug,
			share_url: shareUrl,
			reading_time_seconds: readingTimeSeconds,
			scroll_depth_pct: scrollDepthPct,
		});
	}

	// GTM dataLayer — custom event for tag triggers
	const dataLayer = (window as { dataLayer?: Record<string, unknown>[] })
		.dataLayer;
	if (dataLayer) {
		dataLayer.push({
			event: "post_shared",
			share_platform: platform,
			post_slug: slug,
			post_title: title,
			share_url: shareUrl,
			reading_time_seconds: readingTimeSeconds,
			scroll_depth_pct: scrollDepthPct,
			device_type: deviceType,
		});
	}

	// Meta Pixel — standard Share event
	sendMetaEvent("Share", {
		content_name: title,
		content_type: "blog_post",
		content_ids: [slug],
	});

	// Plausible — custom event (max 5 custom props)
	const plausible = (
		window as { plausible?: (event: string, opts: unknown) => void }
	).plausible;
	if (plausible) {
		plausible("Share", {
			props: {
				platform,
				slug,
				title,
				reading_time: Math.round(readingTimeSeconds),
				scroll_depth: Math.round(scrollDepthPct),
			},
		});
	}

	// Microsoft Clarity — tag the session with share metadata
	const clarity = (window as { clarity?: (...args: unknown[]) => void })
		.clarity;
	if (clarity) {
		clarity("set", "share_platform", platform);
		clarity("set", "shared_post", slug);
		clarity(
			"set",
			"share_reading_time",
			String(Math.round(readingTimeSeconds)),
		);
	}
}

export function getPlatformShareUrl(
	platform: SharePlatform,
	utmUrl: string,
	title: string,
): string | null {
	const encodedUrl = encodeURIComponent(utmUrl);
	const encodedTitle = encodeURIComponent(title);

	switch (platform) {
		case "twitter":
			return `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`;
		case "linkedin":
			return `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
		case "reddit":
			return `https://reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`;
		case "hackernews":
			return `https://news.ycombinator.com/submitlink?u=${encodedUrl}&t=${encodedTitle}`;
		case "facebook":
			return `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
		case "email":
			return `mailto:?subject=${encodedTitle}&body=${encodedUrl}`;
		case "copy_link":
			return null;
	}
}
