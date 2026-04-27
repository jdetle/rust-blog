"use client";

type StitchSignal = {
	label: string;
	description: string;
	value: string;
	present: boolean;
};

function shortValue(value: string | null, fallback: string): string {
	if (!value) return fallback;
	return value.length > 22 ? `${value.slice(0, 20)}...` : value;
}

function normaliseText(value: string | null, fallback: string): string {
	if (!value) return fallback;
	return value.length > 36 ? `${value.slice(0, 34)}...` : value;
}

/** Visual map of how several weak identifiers collapse into one visitor profile. */
export function IdentityStitchingDiagram({
	canvasFingerprint,
	distinctId,
	hasFirstPartyCookie,
	referrerSummary,
	utmSummary,
	activityCount,
}: {
	canvasFingerprint: string | null;
	distinctId: string | null;
	hasFirstPartyCookie: boolean;
	referrerSummary: string | null;
	utmSummary: string | null;
	activityCount: number;
}) {
	const hasReferralContext = Boolean(referrerSummary || utmSummary);
	const hasActivity = activityCount > 0;

	const signals: StitchSignal[] = [
		{
			label: "Canvas fingerprint",
			description: "Stable rendering hash from this browser/device.",
			value: shortValue(canvasFingerprint, "No fingerprint yet"),
			present: Boolean(canvasFingerprint),
		},
		{
			label: "Product distinct_id",
			description: "App analytics identifier used to join visits.",
			value: shortValue(distinctId, "No distinct_id yet"),
			present: Boolean(distinctId?.trim()),
		},
		{
			label: "First-party cookie",
			description: "Site-owned browser storage that survives page loads.",
			value: hasFirstPartyCookie
				? "Cookie detected on this site"
				: "Cookie not detected",
			present: hasFirstPartyCookie,
		},
		{
			label: "Referrer + UTM context",
			description: "Where you came from and any campaign tags attached.",
			value: hasReferralContext
				? normaliseText(
						utmSummary
							? `${referrerSummary ?? "Direct"} | ${utmSummary}`
							: referrerSummary,
						"Referral context seen",
					)
				: "No referrer or campaign tags",
			present: hasReferralContext,
		},
		{
			label: "On-site activity",
			description: "Page views and custom events tied back to the same visit.",
			value:
				activityCount > 0
					? `${activityCount} stored event${activityCount === 1 ? "" : "s"}`
					: "No stored events yet",
			present: hasActivity,
		},
	];

	const presentCount = signals.filter((signal) => signal.present).length;
	const profileSummary =
		presentCount >= 4
			? "Several weak IDs agree, so the profile can follow one visitor with high confidence."
			: presentCount >= 2
				? "A partial profile is already possible because multiple clues line up."
				: "The profile is still thin, but even one durable ID can seed future joins.";

	return (
		<div className="stitching-wrap">
			<p className="detect-note">
				Analytics tools rarely need one perfect identifier. They combine several
				smaller clues until the same browser looks like one person-shaped
				record. Stronger cards below mean that clue is present in this session.
			</p>
			<section
				className="stitching-flow"
				aria-label="How weak identifiers merge into one visitor profile"
			>
				<div className="stitching-signal-column">
					{signals.map((signal, index) => (
						<div
							key={signal.label}
							className={`stitching-signal-card ${
								signal.present
									? "stitching-signal-card--present"
									: "stitching-signal-card--missing"
							}`}
						>
							<div className="stitching-signal-copy">
								<p className="stitching-signal-label">
									{index + 1}. {signal.label}
								</p>
								<p className="stitching-signal-description">
									{signal.description}
								</p>
								<p className="stitching-signal-value">{signal.value}</p>
							</div>
							<div className="stitching-signal-join" aria-hidden="true">
								<span className="stitching-signal-rail" />
								<span className="stitching-signal-arrow" />
							</div>
						</div>
					))}
				</div>
				<aside className="stitching-profile-card">
					<p className="stitching-profile-kicker">Merged visitor profile</p>
					<h3 className="stitching-profile-title">One record, many inputs</h3>
					<p className="stitching-profile-summary">{profileSummary}</p>
					<ul className="stitching-profile-points">
						<li>
							{presentCount} of {signals.length} inputs are present right now.
						</li>
						<li>
							Page history, campaign tags, and device clues can all land on the
							same row.
						</li>
						<li>
							Missing signals weaken certainty, but they do not stop stitching.
						</li>
					</ul>
				</aside>
			</section>
			<dl className="stitching-legend-dl">
				{signals.map((signal) => (
					<div key={signal.label} className="stitching-legend-row">
						<dt>{signal.label}</dt>
						<dd>{signal.value}</dd>
					</div>
				))}
			</dl>
		</div>
	);
}
