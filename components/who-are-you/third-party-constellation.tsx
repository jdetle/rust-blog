"use client";

import { useEffect, useState } from "react";
import type { ThirdPartyHostAgg } from "@/lib/third-party-resources";
import { aggregateThirdPartyResources } from "@/lib/third-party-resources";

const MAX_NODES = 14;

function ConstellationSvg({ hosts }: { hosts: ThirdPartyHostAgg[] }) {
	const display = hosts.slice(0, MAX_NODES);
	const n = display.length;
	const cx = 50;
	const cy = 50;
	const r = 34;

	if (n === 0) {
		return (
			<div className="constellation-empty">
				<p className="detect-note">
					No cross-origin resource requests recorded yet, or the browser hid
					details (cross-origin timing can be limited).
				</p>
			</div>
		);
	}

	const satellites = display.map((h, i) => {
		const angle = (2 * Math.PI * i) / n - Math.PI / 2;
		const thickness = Math.min(6, 1 + Math.min(h.count, 12) * 0.45);
		return {
			x: cx + r * Math.cos(angle),
			y: cy + r * Math.sin(angle),
			strokeW: thickness,
			host: h.host,
			count: h.count,
		};
	});

	const shortHost = (h: string) =>
		h.length > 22 ? `${h.slice(0, 20)}\u2026` : h;

	return (
		<div className="constellation-wrap">
			<svg
				className="constellation-svg"
				viewBox="0 0 100 100"
				role="img"
				aria-label="Third-party hosts contacted during this page load"
			>
				<title>Third-party network graph</title>
				{satellites.map((s) => (
					<line
						key={`e-${s.host}`}
						x1={cx}
						y1={cy}
						x2={s.x}
						y2={s.y}
						className="constellation-edge"
						strokeWidth={Math.min(s.strokeW * 0.35, 3)}
					/>
				))}
				<circle className="constellation-core" cx={cx} cy={cy} r={7} />
				<text
					className="constellation-core-label"
					x={cx}
					y={cy + 2.5}
					textAnchor="middle"
					fontSize="4"
				>
					You
				</text>
				{satellites.map((s) => (
					<g key={s.host}>
						<circle className="constellation-node" cx={s.x} cy={s.y} r={3.2} />
						<text
							className="constellation-host"
							x={s.x}
							y={s.y - 6}
							textAnchor="middle"
							fontSize="3.2"
						>
							{shortHost(s.host)}
						</text>
						<title>
							{s.host} — {s.count} request{s.count === 1 ? "" : "s"}
						</title>
					</g>
				))}
			</svg>
			<ul className="constellation-legend">
				{display.map((h) => (
					<li key={h.host}>
						<span className="constellation-legend-host">{h.host}</span>
						<span className="constellation-legend-meta">
							{h.count}× &middot; {h.initiatorTypes.join(", ")}
						</span>
					</li>
				))}
			</ul>
		</div>
	);
}

export function ThirdPartyConstellation() {
	const [hosts, setHosts] = useState<ThirdPartyHostAgg[]>([]);
	const [ready, setReady] = useState(false);

	useEffect(() => {
		const run = () => {
			try {
				const origin = window.location.origin;
				const entries = performance.getEntriesByType(
					"resource",
				) as PerformanceResourceTiming[];
				setHosts(aggregateThirdPartyResources(origin, entries));
			} catch {
				setHosts([]);
			}
			setReady(true);
		};
		const t = window.setTimeout(run, 2000);
		return () => window.clearTimeout(t);
	}, []);

	if (!ready) {
		return (
			<p className="detect-note loading-pulse">
				Mapping outbound requests&hellip;
			</p>
		);
	}

	return (
		<>
			<p className="detect-note">
				Each line is a different hostname your browser contacted while loading
				this page (scripts, pixels, fonts, APIs). Thicker lines mean more
				requests. This is a <strong>minimum</strong> &mdash; some third parties
				hide details from Resource Timing.
			</p>
			<ConstellationSvg hosts={hosts} />
		</>
	);
}
