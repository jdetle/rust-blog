"use client";

import posthog from "posthog-js";
import { useEffect, useRef, useState } from "react";
import { canvasFingerprint } from "@/components/who-are-you/canvas-fingerprint";

const AVATAR_LABEL =
	"Permanent avatar associated with your canvas fingerprint. The same image is stored for your browser and returns when you revisit this site; it is not a photograph.";

export function HomeFingerprintAvatar() {
	const [avatarSvg, setAvatarSvg] = useState<string | null>(null);
	const [phase, setPhase] = useState<"loading" | "ready" | "absent">("loading");
	const requestedRef = useRef(false);

	useEffect(() => {
		const fp = canvasFingerprint();
		const distinctId = posthog.get_distinct_id?.();

		let cancelled = false;
		setPhase("loading");

		void (async () => {
			const url = new URL(
				"/api/analytics/user-profile",
				window.location.origin,
			);
			url.searchParams.set("fingerprint", fp);
			if (distinctId) {
				url.searchParams.set("distinct_id", distinctId);
				url.searchParams.set("user_id", distinctId);
			}

			try {
				const r = await fetch(url.href);
				const data = (await r.json()) as {
					avatar_svg?: string | null;
				};
				if (cancelled) return;
				if (data.avatar_svg) {
					setAvatarSvg(data.avatar_svg);
					setPhase("ready");
					return;
				}

				if (!fp || fp === "Canvas blocked" || requestedRef.current) {
					setPhase("absent");
					return;
				}
				requestedRef.current = true;

				const gr = await fetch("/api/analytics/generate-avatar", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						fingerprint: fp,
						distinct_id: distinctId ?? undefined,
						user_id: distinctId ?? undefined,
					}),
				});
				const gen = (await gr.json()) as { avatar_svg?: string | null };
				if (cancelled) return;
				if (gen.avatar_svg) {
					setAvatarSvg(gen.avatar_svg);
					setPhase("ready");
				} else {
					setPhase("absent");
				}
			} catch {
				if (!cancelled) setPhase("absent");
			}
		})();

		return () => {
			cancelled = true;
		};
	}, []);

	if (phase === "absent") return null;

	if (phase === "loading") {
		return (
			<div
				className="home-fingerprint-avatar home-fingerprint-avatar--loading"
				aria-hidden="true"
			>
				<div className="home-fingerprint-avatar-skeleton" />
			</div>
		);
	}

	if (!avatarSvg) return null;

	return (
		<div className="home-fingerprint-avatar">
			<div
				className="home-fingerprint-avatar-svg"
				// biome-ignore lint/security/noDangerouslySetInnerHtml: SVG from analytics service + server-side sanitizer only
				dangerouslySetInnerHTML={{ __html: avatarSvg }}
				role="img"
				aria-label={AVATAR_LABEL}
			/>
		</div>
	);
}
