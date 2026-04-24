"use client";

import { useId } from "react";
import { WhoExposureBar } from "@/components/who-are-you/recharts/who-scalar-bar";

export function ExposureMeter({ value }: { value: number }) {
	const uid = useId().replace(/:/g, "");
	const gid = `exp-${uid}`;

	return (
		<div className="exposure-card">
			<WhoExposureBar
				value={value}
				gradientId={gid}
				ariaLabel={`Estimated commercial tracking surface ${value} percent`}
			/>
			<span className="meter-label">
				Estimated commercial tracking surface: {value}%
			</span>
			<p className="detect-note exposure-meter-note">
				Combines active script detectors, third-party hosts (Resource Timing),
				how many events are stored for you, and VPN-style signals. Use it as a
				conversation starter, not a precise score.
			</p>
		</div>
	);
}
