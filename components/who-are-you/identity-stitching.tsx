"use client";

import { Sankey, Tooltip } from "recharts";
import { WhoChartBox } from "./recharts/who-charts-shared";

const tooltipStyle = {
	backgroundColor: "rgba(242, 236, 224, 0.96)",
	border: "1px solid rgba(42, 35, 28, 0.12)",
	borderRadius: 8,
	color: "#2a231c",
	fontSize: 12,
};

/**
 * Sankey from **this session’s** identifier signals (fingerprint, distinct_id, cookie).
 */
export function IdentityStitchingDiagram({
	canvasFingerprint,
	distinctId,
	hasFirstPartyCookie,
}: {
	canvasFingerprint: string | null;
	distinctId: string | null;
	hasFirstPartyCookie: boolean;
}) {
	const fpShort =
		canvasFingerprint && canvasFingerprint.length > 12
			? `${canvasFingerprint.slice(0, 10)}\u2026`
			: (canvasFingerprint ?? "\u2014");
	const idShort =
		distinctId && distinctId.length > 18
			? `${distinctId.slice(0, 16)}\u2026`
			: (distinctId ?? "\u2014");

	const linkStrength = (present: boolean) => (present ? 4 : 0.4);

	const data = {
		nodes: [
			{ name: "Canvas fingerprint" },
			{ name: "Product distinct_id" },
			{ name: "First-party cookie" },
			{ name: "Merged visitor profile" },
		],
		links: [
			{
				source: 0,
				target: 3,
				value: linkStrength(Boolean(canvasFingerprint)),
			},
			{
				source: 1,
				target: 3,
				value: linkStrength(Boolean(distinctId?.trim())),
			},
			{ source: 2, target: 3, value: linkStrength(hasFirstPartyCookie) },
		],
	};

	return (
		<div className="stitching-wrap">
			<p className="detect-note">
				Product analytics tools can merge identifiers into one visitor profile
				(subject to their privacy policy and your region&apos;s law). Link width
				reflects whether each signal is present in <em>this</em> session.
			</p>
			<WhoChartBox
				height={260}
				aria-label="Sankey diagram of identifiers flowing into a merged profile"
			>
				<Sankey
					data={data}
					nodeWidth={12}
					nodePadding={32}
					linkCurvature={0.5}
					iterations={64}
					margin={{ top: 8, right: 16, bottom: 8, left: 16 }}
					sort={false}
				>
					<Tooltip contentStyle={tooltipStyle} />
				</Sankey>
			</WhoChartBox>
			<dl className="stitching-legend-dl">
				<div className="stitching-legend-row">
					<dt>Canvas fingerprint</dt>
					<dd>
						<code className="persona-code">{fpShort}</code>
					</dd>
				</div>
				<div className="stitching-legend-row">
					<dt>Product distinct_id</dt>
					<dd>
						<code className="persona-code">{idShort}</code>
					</dd>
				</div>
				<div className="stitching-legend-row">
					<dt>First-party cookie</dt>
					<dd>{hasFirstPartyCookie ? "Set on this site" : "Not detected"}</dd>
				</div>
			</dl>
		</div>
	);
}
