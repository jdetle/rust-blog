"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
	buildShareUrl,
	getPlatformShareUrl,
	trackShareEvent,
} from "@/lib/share-tracking";

type SharePlatform =
	| "twitter"
	| "linkedin"
	| "reddit"
	| "hackernews"
	| "facebook"
	| "email"
	| "copy_link";

interface ShareBarProps {
	path: string;
	slug: string;
	title: string;
	campaign?: string;
	content?: string;
}

const PLATFORMS: { id: SharePlatform; label: string }[] = [
	{ id: "twitter", label: "X" },
	{ id: "linkedin", label: "LinkedIn" },
	{ id: "reddit", label: "Reddit" },
	{ id: "hackernews", label: "HN" },
	{ id: "facebook", label: "Facebook" },
	{ id: "email", label: "Email" },
	{ id: "copy_link", label: "Copy link" },
];

function getScrollDepth(): number {
	const scrollTop =
		document.documentElement.scrollTop || document.body.scrollTop;
	const scrollHeight =
		document.documentElement.scrollHeight -
		document.documentElement.clientHeight;
	if (scrollHeight <= 0) return 100;
	return Math.round((scrollTop / scrollHeight) * 100);
}

function hostMatch(hostname: string, domain: string): boolean {
	return hostname === domain || hostname.endsWith(`.${domain}`);
}

function getReferrerType(): string {
	const stored = sessionStorage.getItem("_referrer");
	const ref = document.referrer || stored || "";
	if (!ref) return "direct";
	try {
		const host = new URL(ref).hostname.toLowerCase();
		if (
			hostMatch(host, "google.com") ||
			hostMatch(host, "bing.com") ||
			hostMatch(host, "duckduckgo.com")
		)
			return "search";
		if (
			hostMatch(host, "twitter.com") ||
			hostMatch(host, "x.com") ||
			host === "t.co"
		)
			return "social:twitter";
		if (hostMatch(host, "linkedin.com")) return "social:linkedin";
		if (hostMatch(host, "reddit.com")) return "social:reddit";
		if (host === "news.ycombinator.com") return "social:hackernews";
		if (hostMatch(host, "github.com")) return "social:github";
		if (hostMatch(host, "facebook.com")) return "social:facebook";
		return `other:${host}`;
	} catch {
		return "other";
	}
}

function getDeviceType(): string {
	const w = screen.width;
	if (navigator.maxTouchPoints > 0 && w < 768) return "mobile";
	if (navigator.maxTouchPoints > 0 && w >= 768 && w < 1200) return "tablet";
	return "desktop";
}

function getCanvasFingerprint(): string {
	try {
		const canvas = document.createElement("canvas");
		canvas.width = 280;
		canvas.height = 40;
		const ctx = canvas.getContext("2d");
		if (!ctx) return "";
		ctx.textBaseline = "top";
		ctx.font = "14px 'Arial'";
		ctx.fillStyle = "#f60";
		ctx.fillRect(125, 1, 62, 20);
		ctx.fillStyle = "#069";
		ctx.fillText("jdetle.com \u{1F31F} fingerprint", 2, 15);
		ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
		ctx.fillText("jdetle.com \u{1F31F} fingerprint", 4, 17);
		const data = canvas.toDataURL();
		let hash = 0;
		for (let i = 0; i < data.length; i++) {
			hash = (hash << 5) - hash + data.charCodeAt(i);
			hash = hash & hash;
		}
		let hex = (hash >>> 0).toString(16);
		while (hex.length < 8) hex = `0${hex}`;
		return hex;
	} catch {
		return "";
	}
}

export function ShareBar({
	path,
	slug,
	title,
	campaign = "post_share",
	content = slug,
}: ShareBarProps) {
	const mountTime = useRef(performance.now());
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		mountTime.current = performance.now();
	}, []);

	const handleShare = useCallback(
		(platform: SharePlatform) => {
			const utmUrl = buildShareUrl({
				path,
				platform,
				campaign,
				content,
			});
			const readingTimeSeconds = Math.round(
				(performance.now() - mountTime.current) / 1000,
			);

			trackShareEvent({
				platform,
				slug,
				title,
				shareUrl: utmUrl,
				pageUrl: window.location.href,
				readingTimeSeconds,
				scrollDepthPct: getScrollDepth(),
				referrerType: getReferrerType(),
				canvasFingerprint: getCanvasFingerprint(),
				deviceType: getDeviceType(),
			});

			if (platform === "copy_link") {
				navigator.clipboard.writeText(utmUrl).then(() => {
					setCopied(true);
					setTimeout(() => setCopied(false), 2000);
				});
				return;
			}

			const shareUrl = getPlatformShareUrl(platform, utmUrl, title);
			if (shareUrl) {
				window.open(shareUrl, "_blank", "noopener,noreferrer");
			}
		},
		[campaign, content, path, slug, title],
	);

	return (
		<div className="share-bar">
			<span className="share-label">Share</span>
			<div className="share-buttons">
				{PLATFORMS.map((p) => (
					<button
						key={p.id}
						type="button"
						className="share-btn"
						onClick={() => handleShare(p.id)}
					>
						{p.id === "copy_link" && copied ? "Copied" : p.label}
					</button>
				))}
			</div>
		</div>
	);
}
