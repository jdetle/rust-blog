"use client";

import Link from "next/link";
import posthog from "posthog-js";
import { useEffect, useState } from "react";
import { canvasFingerprint } from "@/components/who-are-you/canvas-fingerprint";

type LoadState = "loading" | "ready" | "unavailable";

export function HomeWhoSnapshot() {
	const [fingerprint, setFingerprint] = useState<string | null>(null);
	const [interactionCount, setInteractionCount] = useState<number | null>(null);
	const [loadState, setLoadState] = useState<LoadState>("loading");

	useEffect(() => {
		const fp = canvasFingerprint();
		setFingerprint(fp);

		const params = new URLSearchParams();
		params.set("fingerprint", fp);
		params.set("limit", "100");
		const distinct = posthog.get_distinct_id?.();
		if (distinct) {
			params.set("distinct_id", distinct);
			params.set("user_id", distinct);
		}

		const url = new URL("/api/analytics/my-events", window.location.origin);
		params.forEach((value, key) => {
			url.searchParams.set(key, value);
		});

		fetch(url.href)
			.then((r) =>
				r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
			)
			.then((data: { events?: unknown[] }) => {
				const n = Array.isArray(data.events) ? data.events.length : 0;
				setInteractionCount(n);
				setLoadState("ready");
			})
			.catch(() => {
				setInteractionCount(null);
				setLoadState("unavailable");
			});
	}, []);

	const fpShort =
		fingerprint && fingerprint.length > 14
			? `${fingerprint.slice(0, 12)}…`
			: (fingerprint ?? "—");

	const countLabel =
		loadState === "loading"
			? "…"
			: interactionCount === null
				? "—"
				: String(interactionCount);

	return (
		<section className="home-who-rich" aria-labelledby="home-who-rich-title">
			<div className="home-who-rich-inner">
				<div className="home-who-rich-header">
					<span className="home-who-rich-badge" aria-hidden="true">
						Live
					</span>
					<h2 id="home-who-rich-title" className="home-who-rich-title">
						Who are you?
					</h2>
					<p className="home-who-rich-sub">
						Browser fingerprint demo — same canvas hash as the full page, wired
						into analytics.
					</p>
				</div>

				<div className="home-who-rich-metrics">
					<div className="home-who-metric home-who-metric--primary">
						<p className="home-who-metric-value" aria-live="polite">
							{countLabel}
						</p>
						<p className="home-who-metric-label">
							Recorded interactions
							<span className="home-who-metric-hint">
								{" "}
								(merged events for your fingerprint, cap 100)
							</span>
						</p>
					</div>
					<div className="home-who-metric home-who-metric--secondary">
						<p className="home-who-metric-label">Canvas fingerprint</p>
						<p className="home-who-fp-chip">
							<code>{fpShort}</code>
						</p>
					</div>
				</div>

				{loadState === "unavailable" ? (
					<p className="home-who-rich-footnote">
						Count unavailable offline or when analytics APIs are not configured.
						Open the demo for the full run-down.
					</p>
				) : null}

				<p className="home-who-rich-cta">
					<Link className="btn btn-primary" href="/who-are-you">
						Open the full demo
					</Link>
				</p>
			</div>
		</section>
	);
}
