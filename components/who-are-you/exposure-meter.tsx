"use client";

export function ExposureMeter({ value }: { value: number }) {
	return (
		<div className="exposure-card">
			<div className="meter-track exposure-meter-wide">
				<div
					className="meter-fill meter-exposure"
					style={{ width: `${Math.max(value, 4)}%` }}
				/>
			</div>
			<span className="meter-label">
				Estimated commercial tracking surface: {value}%
			</span>
			<p className="detect-note exposure-meter-note">
				Combines active script detectors, distinct third-party hosts (Resource
				Timing), how many events are stored for you, and VPN-style signals. Use
				it as a conversation starter, not a precise score.
			</p>
		</div>
	);
}
