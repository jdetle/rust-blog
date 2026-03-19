"use client";

import { Analytics } from "@vercel/analytics/next";

function getFingerprintFromCookie(): string | null {
	if (typeof document === "undefined") return null;
	const match = document.cookie.match(/(?:^|;\s*)fingerprint=([^;]*)/);
	return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Analytics with beforeSend that injects fingerprint (from cookie) into events.
 * Cookie is set by who-are-you client-profile when fingerprint is computed.
 * Enables Vercel Drain to associate events with fingerprint for warehouse queries.
 */
export function VercelAnalyticsWithFingerprint() {
	return (
		<Analytics
			beforeSend={(event) => {
				const fp = getFingerprintFromCookie();
				if (!fp) return event;
				return { ...event, fingerprint: fp };
			}}
		/>
	);
}
