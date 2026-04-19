"use client";

import posthog from "posthog-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { TurnstileGate } from "@/components/turnstile-gate";
import { canvasFingerprint } from "@/components/who-are-you/canvas-fingerprint";

const AVATAR_LABEL =
	"Personalised collage generated from regional artists' styles and your browser signals. Updates each unique visit. Not a photograph.";

type Phase = "awaiting-captcha" | "loading" | "ready" | "absent";

interface UserContext {
	city?: string;
	region?: string;
	country?: string;
	latitude?: string;
	longitude?: string;
	timezone_ip?: string;
	asn?: string;
	org?: string;
	is_eu?: boolean;
	currency?: string;
	calling_code?: string;
	browser?: string;
	os?: string;
	device_type?: string;
	screen?: string;
	gpu?: string;
	cores?: string;
	ram?: string;
	timezone_browser?: string;
	languages?: string;
	dark_mode?: boolean;
	reduced_motion?: boolean;
	connection_type?: string;
	referrer_type?: string;
	utm?: string;
	vpn_verdict?: string;
}

function parseBrowser(ua: string): string {
	if (ua.includes("Firefox/"))
		return `Firefox ${ua.split("Firefox/")[1].split(" ")[0]}`;
	if (ua.includes("Edg/")) return `Edge ${ua.split("Edg/")[1].split(" ")[0]}`;
	if (ua.includes("OPR/")) return `Opera ${ua.split("OPR/")[1].split(" ")[0]}`;
	if (ua.includes("Chrome/"))
		return `Chrome ${ua.split("Chrome/")[1].split(" ")[0]}`;
	if (ua.includes("Safari/") && ua.includes("Version/"))
		return `Safari ${ua.split("Version/")[1].split(" ")[0]}`;
	return ua.slice(0, 40);
}

function parseOS(ua: string): string {
	if (ua.includes("Windows NT 10")) return "Windows 10/11";
	if (ua.includes("Windows NT")) return "Windows";
	if (ua.includes("Mac OS X")) {
		const ver = ua.match(/Mac OS X (\d+[_.\d]+)/);
		return `macOS ${ver ? ver[1].replace(/_/g, ".") : ""}`;
	}
	if (ua.includes("Android")) {
		const v = ua.match(/Android ([\d.]+)/);
		return `Android ${v ? v[1] : ""}`;
	}
	if (ua.includes("iPhone OS") || ua.includes("iPad")) {
		const iv = ua.match(/OS (\d+[_\d]+)/);
		return `iOS ${iv ? iv[1].replace(/_/g, ".") : ""}`;
	}
	if (ua.includes("Linux")) return "Linux";
	return "Unknown";
}

function getGPU(): string {
	try {
		const c = document.createElement("canvas");
		const gl = c.getContext("webgl") || c.getContext("experimental-webgl");
		if (!gl || !(gl instanceof WebGLRenderingContext)) return "";
		const ext = gl.getExtension("WEBGL_debug_renderer_info");
		if (!ext) return "";
		return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;
	} catch {
		return "";
	}
}

async function buildUserContext(): Promise<UserContext> {
	const ua = navigator.userAgent;
	const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const conn = (
		navigator as {
			connection?: { effectiveType?: string; downlink?: number; rtt?: number };
		}
	).connection;

	const ctx: UserContext = {
		browser: parseBrowser(ua),
		os: parseOS(ua),
		device_type:
			navigator.maxTouchPoints > 0 && screen.width < 768
				? "Mobile"
				: navigator.maxTouchPoints > 0
					? "Tablet"
					: "Desktop",
		screen: `${screen.width}x${screen.height}`,
		gpu: getGPU() || undefined,
		cores: navigator.hardwareConcurrency
			? `${navigator.hardwareConcurrency}`
			: undefined,
		ram:
			"deviceMemory" in navigator
				? `${(navigator as { deviceMemory: number }).deviceMemory} GB`
				: undefined,
		timezone_browser: tz,
		languages: (navigator.languages || [navigator.language]).join(", "),
		dark_mode: window.matchMedia("(prefers-color-scheme: dark)").matches,
		reduced_motion: window.matchMedia("(prefers-reduced-motion: reduce)")
			.matches,
		connection_type: conn?.effectiveType ?? undefined,
		referrer_type: document.referrer
			? (() => {
					try {
						const host = new URL(document.referrer).hostname.toLowerCase();
						if (host.includes("google.") || host.includes("bing.com"))
							return "search";
						if (host.includes("twitter.com") || host.includes("t.co"))
							return "social:twitter";
						if (host.includes("linkedin.com")) return "social:linkedin";
						if (host.includes("reddit.com")) return "social:reddit";
						return `other:${host}`;
					} catch {
						return "other";
					}
				})()
			: "direct",
	};

	// UTM tags from URL or sessionStorage
	const params = new URLSearchParams(window.location.search);
	const utmParts: string[] = [];
	for (const k of [
		"utm_source",
		"utm_medium",
		"utm_campaign",
		"utm_term",
		"utm_content",
	]) {
		const v = params.get(k);
		if (v) utmParts.push(`${k.replace("utm_", "")}:${v}`);
	}
	if (utmParts.length) ctx.utm = utmParts.join(" · ");

	// Edge geo from /api/edge-detect (best-effort)
	try {
		const res = await fetch("/api/edge-detect");
		if (res.ok) {
			const data = (await res.json()) as {
				edge?: {
					city?: string;
					region?: string;
					country?: string;
					latitude?: string;
					longitude?: string;
					timezone?: string;
					asn?: string;
					org?: string;
					isEU?: boolean;
				};
				ipapi?: { currency?: string; countryCallingCode?: string };
			};
			if (data.edge) {
				ctx.city = data.edge.city ?? undefined;
				ctx.region = data.edge.region ?? undefined;
				ctx.country = data.edge.country ?? undefined;
				ctx.latitude = data.edge.latitude ?? undefined;
				ctx.longitude = data.edge.longitude ?? undefined;
				ctx.timezone_ip = data.edge.timezone ?? undefined;
				ctx.asn = data.edge.asn ?? undefined;
				ctx.org = data.edge.org ?? undefined;
				ctx.is_eu = data.edge.isEU ?? undefined;
			}
			if (data.ipapi) {
				ctx.currency = (data.ipapi.currency as string) ?? undefined;
				ctx.calling_code =
					(data.ipapi.countryCallingCode as string) ?? undefined;
			}
		}
	} catch {
		// Edge detect is optional — continue without geo.
	}

	return ctx;
}

export function HomeFingerprintAvatar() {
	const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
	const [avatarSvg, setAvatarSvg] = useState<string | null>(null);
	const [phase, setPhase] = useState<Phase>("awaiting-captcha");
	const requestedRef = useRef(false);
	const tokenRef = useRef<string | null>(null);

	const handleToken = useCallback((token: string) => {
		tokenRef.current = token;
	}, []);

	const runAvatarFlow = useCallback(async (turnstileToken: string) => {
		const fp = canvasFingerprint();
		const distinctId = posthog.get_distinct_id?.();
		const sessionId =
			(
				posthog as { get_session_id?: () => string | null }
			).get_session_id?.() ?? null;

		setPhase("loading");

		let cancelled = false;
		const profileController = new AbortController();
		const generateController = new AbortController();
		const profileTimeoutId = setTimeout(() => profileController.abort(), 6_000);
		let generateTimeoutId: ReturnType<typeof setTimeout> | undefined;

		try {
			// ── Step 1: check if a cached avatar exists ───────────────────
			const profileUrl = new URL(
				"/api/analytics/user-profile",
				window.location.origin,
			);
			profileUrl.searchParams.set("fingerprint", fp);
			if (distinctId) {
				profileUrl.searchParams.set("distinct_id", distinctId);
				profileUrl.searchParams.set("user_id", distinctId);
			}
			if (sessionId) profileUrl.searchParams.set("session_id", sessionId);

			const r = await fetch(profileUrl.href, {
				signal: profileController.signal,
			});
			const data = (await r.json()) as {
				avatar_url?: string | null;
				avatar_svg?: string | null;
			};
			if (cancelled) return;

			if (data.avatar_url) {
				setAvatarUrl(data.avatar_url);
				setPhase("ready");
				return;
			}
			if (data.avatar_svg) {
				setAvatarSvg(data.avatar_svg);
				setPhase("ready");
				return;
			}

			// ── Step 2: generate a new avatar ────────────────────────────
			if (!fp || fp === "Canvas blocked" || requestedRef.current) {
				setPhase("absent");
				return;
			}
			requestedRef.current = true;

			const userContext = await buildUserContext();

			generateTimeoutId = setTimeout(() => generateController.abort(), 45_000);
			const gr = await fetch("/api/analytics/generate-avatar", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					fingerprint: fp,
					distinct_id: distinctId ?? undefined,
					user_id: distinctId ?? undefined,
					session_id: sessionId ?? undefined,
					turnstile_token: turnstileToken,
					user_context: userContext,
				}),
				signal: generateController.signal,
			});
			const gen = (await gr.json()) as {
				avatar_url?: string | null;
				avatar_svg?: string | null;
			};
			if (cancelled) return;

			if (gen.avatar_url) {
				setAvatarUrl(gen.avatar_url);
				setPhase("ready");
			} else if (gen.avatar_svg) {
				setAvatarSvg(gen.avatar_svg);
				setPhase("ready");
			} else {
				setPhase("absent");
			}
		} catch {
			if (!cancelled) setPhase("absent");
		} finally {
			clearTimeout(profileTimeoutId);
			if (generateTimeoutId !== undefined) clearTimeout(generateTimeoutId);
			cancelled = true;
		}
	}, []);

	useEffect(() => {
		// Wait until we have a Turnstile token before proceeding.
		const checkToken = () => {
			if (!tokenRef.current) {
				setTimeout(checkToken, 100);
				return;
			}
			runAvatarFlow(tokenRef.current);
		};
		checkToken();
	}, [runAvatarFlow]);

	if (phase === "absent") return null;

	if (phase === "awaiting-captcha" || phase === "loading") {
		return (
			<>
				<TurnstileGate onToken={handleToken} />
				<div
					className="home-fingerprint-avatar home-fingerprint-avatar--loading"
					aria-hidden="true"
				>
					<div className="home-fingerprint-avatar-skeleton" />
				</div>
			</>
		);
	}

	if (!avatarUrl && !avatarSvg) return null;

	return (
		<div className="home-fingerprint-avatar">
			{avatarUrl ? (
				// biome-ignore lint/performance/noImgElement: data: URIs are not supported by next/image
				<img
					src={avatarUrl}
					width={256}
					height={256}
					alt={AVATAR_LABEL}
					className="home-fingerprint-avatar-img"
					decoding="async"
				/>
			) : (
				<div
					className="home-fingerprint-avatar-svg"
					// biome-ignore lint/security/noDangerouslySetInnerHtml: SVG from analytics service + server-side sanitizer only
					dangerouslySetInnerHTML={{ __html: avatarSvg ?? "" }}
					role="img"
					aria-label={AVATAR_LABEL}
				/>
			)}
			<p className="home-fingerprint-avatar-disclosure">
				Generated with OpenAI using your visible browser &amp; edge signals.{" "}
				<a href="/who-are-you">See what we know about you.</a>
			</p>
		</div>
	);
}
