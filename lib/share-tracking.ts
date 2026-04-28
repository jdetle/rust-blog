import posthog from "posthog-js";
import { sendMetaEvent } from "./meta-pixel";
import type { SharePlatform } from "./share-url";

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

export { buildShareUrl, getPlatformShareUrl } from "./share-url";
