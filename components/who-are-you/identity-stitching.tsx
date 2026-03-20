"use client";

/**
 * Illustrative diagram: how identifiers can be linked for analytics (educational).
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

	return (
		<div className="stitching-wrap">
			<p className="detect-note">
				Product analytics tools can merge identifiers into one visitor profile
				(subject to their privacy policy and your region&apos;s law).
			</p>
			<svg
				className="stitching-svg"
				viewBox="0 0 320 200"
				role="img"
				aria-label="Diagram linking canvas fingerprint, product ID, and first-party cookie to a merged profile"
			>
				<title>Identity stitching diagram</title>
				<defs>
					<marker
						id="stitch-arrow"
						markerWidth="8"
						markerHeight="8"
						refX="6"
						refY="4"
						orient="auto"
					>
						<path d="M0,0 L8,4 L0,8 z" className="stitching-arrowhead" />
					</marker>
				</defs>

				<rect
					className="stitching-node"
					x="8"
					y="28"
					width="92"
					height="44"
					rx="6"
				/>
				<text className="stitching-label" x="54" y="48" textAnchor="middle">
					Canvas fingerprint
				</text>
				<text className="stitching-value" x="54" y="64" textAnchor="middle">
					{fpShort}
				</text>

				<rect
					className="stitching-node"
					x="116"
					y="28"
					width="92"
					height="44"
					rx="6"
				/>
				<text className="stitching-label" x="162" y="48" textAnchor="middle">
					Product distinct_id
				</text>
				<text className="stitching-value" x="162" y="64" textAnchor="middle">
					{idShort}
				</text>

				<rect
					className="stitching-node"
					x="224"
					y="28"
					width="88"
					height="44"
					rx="6"
				/>
				<text className="stitching-label" x="268" y="48" textAnchor="middle">
					First-party cookie
				</text>
				<text className="stitching-value" x="268" y="64" textAnchor="middle">
					{hasFirstPartyCookie ? "Set on this site" : "Not detected"}
				</text>

				<path
					className="stitching-link"
					d="M 54 80 Q 54 108 160 118"
					markerEnd="url(#stitch-arrow)"
				/>
				<path
					className="stitching-link"
					d="M 162 80 Q 162 108 160 118"
					markerEnd="url(#stitch-arrow)"
				/>
				<path
					className="stitching-link"
					d="M 268 80 Q 268 108 160 118"
					markerEnd="url(#stitch-arrow)"
				/>

				<rect
					className="stitching-merge"
					x="72"
					y="128"
					width="176"
					height="56"
					rx="8"
				/>
				<text
					className="stitching-merge-title"
					x="160"
					y="156"
					textAnchor="middle"
				>
					Merged visitor profile
				</text>
				<text
					className="stitching-merge-sub"
					x="160"
					y="174"
					textAnchor="middle"
				>
					Events &amp; page views tied together
				</text>
			</svg>
		</div>
	);
}
