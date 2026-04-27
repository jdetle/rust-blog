"use client";

import type { ReactElement } from "react";

export type AnalyticsCapabilityKey =
	| "pageviews"
	| "customEvents"
	| "sessionReplay"
	| "heatmaps"
	| "identity"
	| "crossSite";

export type AnalyticsCapabilityValue = "yes" | "partial" | "no";

export type AnalyticsCapabilityMap = Record<
	AnalyticsCapabilityKey,
	AnalyticsCapabilityValue
>;

export type AnalyticsToolProfile = {
	name: string;
	active: boolean;
	note?: string;
	capabilities: AnalyticsCapabilityMap;
};

const CAPABILITY_LABELS: Record<AnalyticsCapabilityKey, string> = {
	pageviews: "Page views",
	customEvents: "Custom events",
	sessionReplay: "Session replay",
	heatmaps: "Heatmaps",
	identity: "ID stitching",
	crossSite: "Cross-site",
};

function capabilityTone(value: AnalyticsCapabilityValue): string {
	if (value === "yes") return "analytics-capability--yes";
	if (value === "partial") return "analytics-capability--partial";
	return "analytics-capability--no";
}

function capabilityCopy(value: AnalyticsCapabilityValue): string {
	if (value === "yes") return "Tracks";
	if (value === "partial") return "Can track";
	return "Not typical";
}

/** Hybrid view: live detection plus typical categories each provider can observe. */
export function AnalyticsToolsChart({
	tools,
}: {
	tools: AnalyticsToolProfile[];
}): ReactElement | null {
	if (tools.length === 0) {
		return null;
	}

	return (
		<section
			className="analytics-tools-chart-wrap"
			aria-label="Detected analytics providers and their typical tracking capabilities"
		>
			{tools.map((tool) => (
				<article key={tool.name} className="analytics-provider-card">
					<div className="analytics-provider-head">
						<div>
							<h3 className="analytics-provider-name">{tool.name}</h3>
							{tool.note ? (
								<p className="analytics-provider-note">{tool.note}</p>
							) : null}
						</div>
						<span
							className={`analytics-provider-status ${
								tool.active
									? "analytics-provider-status--active"
									: "analytics-provider-status--inactive"
							}`}
						>
							{tool.active ? "Detected here" : "Not detected here"}
						</span>
					</div>
					<section
						className="analytics-capability-grid"
						aria-label={`${tool.name} tracking categories`}
					>
						{(Object.keys(CAPABILITY_LABELS) as AnalyticsCapabilityKey[]).map(
							(key) => (
								<div
									key={key}
									className={`analytics-capability-card ${capabilityTone(
										tool.capabilities[key],
									)}`}
								>
									<span className="analytics-capability-label">
										{CAPABILITY_LABELS[key]}
									</span>
									<span className="analytics-capability-value">
										{capabilityCopy(tool.capabilities[key])}
									</span>
								</div>
							),
						)}
					</section>
				</article>
			))}
		</section>
	);
}
