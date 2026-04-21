"use client";

import posthog from "posthog-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { TurnstileGate } from "@/components/turnstile-gate";
import { canvasFingerprint } from "@/components/who-are-you/canvas-fingerprint";

const AVATAR_LABEL =
	"A personalised portrait generated from regional art traditions and your browser signals. Updates each calendar day.";

const LS_AVATAR_PREFIX = "jdetle.avatar.url";
const LS_PERSONA_PREFIX = "jdetle.avatar.persona";

type Phase =
	| "prefetching"
	| "awaiting-captcha"
	| "loading"
	| "ready"
	| "absent";
type LoadingStep = "fingerprint" | "region" | "artists" | "rendering";

const STEP_MESSAGES: Record<LoadingStep, string> = {
	fingerprint: "Reading your fingerprint…",
	region: "Detecting your region…",
	artists: "Composing your art direction…",
	rendering: "Rendering your portrait…",
};

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

const OBSERVATION_INTERVAL_MS = 8_000;

function persistAvatarLocal(
	fp: string,
	avatarUrl: string,
	persona: string | null,
) {
	try {
		localStorage.setItem(`${LS_AVATAR_PREFIX}.${fp}`, avatarUrl);
		if (persona) {
			localStorage.setItem(`${LS_PERSONA_PREFIX}.${fp}`, persona);
		}
	} catch {
		// private mode / quota — ignore
	}
}

export function HomeFingerprintAvatar() {
	const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
	const [personaGuess, setPersonaGuess] = useState<string | null>(null);
	const [phase, setPhase] = useState<Phase>("prefetching");
	const [loadingStep, setLoadingStep] = useState<LoadingStep>("fingerprint");
	const [observations, setObservations] = useState<string[]>([]);
	const [visibleObs, setVisibleObs] = useState(0);
	const requestedRef = useRef(false);
	const tokenRef = useRef<string | null>(null);
	const obsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const needsGenerationRef = useRef(false);
	/** True after reading a valid data URI from localStorage this session (for fetch error fallback). */
	const hadLocalAvatarRef = useRef(false);

	const handleCaptchaError = useCallback(() => {
		setPhase("absent");
	}, []);

	const startObservationReveal = useCallback((obs: string[]) => {
		if (!obs.length) return;
		setObservations(obs);
		setVisibleObs(1);
		let idx = 1;
		obsTimerRef.current = setInterval(() => {
			idx += 1;
			setVisibleObs(idx);
			if (idx >= obs.length && obsTimerRef.current) {
				clearInterval(obsTimerRef.current);
				obsTimerRef.current = null;
			}
		}, OBSERVATION_INTERVAL_MS);
	}, []);

	const stopObservationReveal = useCallback(() => {
		if (obsTimerRef.current) {
			clearInterval(obsTimerRef.current);
			obsTimerRef.current = null;
		}
	}, []);

	const runGeneration = useCallback(
		async (turnstileToken: string) => {
			const fp = canvasFingerprint();
			const distinctId = posthog.get_distinct_id?.();
			const sessionId =
				(
					posthog as { get_session_id?: () => string | null }
				).get_session_id?.() ?? null;

			if (!fp || fp === "Canvas blocked" || requestedRef.current) {
				setPhase("absent");
				return;
			}
			requestedRef.current = true;

			setPhase("loading");
			setLoadingStep("artists");
			const userContext = await buildUserContext();
			setLoadingStep("rendering");

			const generateController = new AbortController();
			const generateTimeoutId = setTimeout(
				() => generateController.abort(),
				90_000,
			);

			const obsPayload = {
				fingerprint: fp,
				distinct_id: distinctId ?? undefined,
				user_id: distinctId ?? undefined,
				user_context: userContext,
			};

			const obsPromise = fetch("/api/analytics/observations", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(obsPayload),
			})
				.then(async (res) => {
					const json = (await res.json()) as { observations?: string[] };
					if (json.observations?.length) {
						startObservationReveal(json.observations);
					}
				})
				.catch(() => {
					/* non-fatal */
				});

			const genPromise = fetch("/api/analytics/generate-avatar", {
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

			try {
				const [gr] = await Promise.all([genPromise, obsPromise]);
				const gen = (await gr.json()) as {
					avatar_url?: string | null;
					persona_guess?: string | null;
				};

				stopObservationReveal();

				if (gen.avatar_url) {
					setAvatarUrl(gen.avatar_url);
					if (gen.persona_guess) setPersonaGuess(gen.persona_guess);
					persistAvatarLocal(fp, gen.avatar_url, gen.persona_guess ?? null);
					setPhase("ready");
				} else {
					setPhase("absent");
				}
			} catch {
				setPhase("absent");
			} finally {
				clearTimeout(generateTimeoutId);
			}
		},
		[startObservationReveal, stopObservationReveal],
	);

	const handleToken = useCallback(
		(token: string) => {
			tokenRef.current = token;
			if (needsGenerationRef.current) {
				needsGenerationRef.current = false;
				void runGeneration(token);
			}
		},
		[runGeneration],
	);

	// Instant path: local cache + server profile before captcha.
	useEffect(() => {
		let cancelled = false;
		const profileController = new AbortController();
		const profileTimeoutId = setTimeout(() => profileController.abort(), 6_000);

		void (async () => {
			const fp = canvasFingerprint();
			if (!fp || fp === "Canvas blocked") {
				if (!cancelled) setPhase("absent");
				return;
			}

			try {
				const lsUrl = localStorage.getItem(`${LS_AVATAR_PREFIX}.${fp}`);
				const lsPersona = localStorage.getItem(`${LS_PERSONA_PREFIX}.${fp}`);
				if (lsUrl?.startsWith("data:image/png;base64,") && !cancelled) {
					hadLocalAvatarRef.current = true;
					setAvatarUrl(lsUrl);
					if (lsPersona) setPersonaGuess(lsPersona);
					setPhase("ready");
				}
			} catch {
				/* ignore */
			}

			const distinctId = posthog.get_distinct_id?.();
			const sessionId =
				(
					posthog as { get_session_id?: () => string | null }
				).get_session_id?.() ?? null;

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

			try {
				const r = await fetch(profileUrl.href, {
					signal: profileController.signal,
				});
				const data = (await r.json()) as {
					avatar_url?: string | null;
					persona_guess?: string | null;
				};
				if (cancelled) return;

				if (data.avatar_url) {
					setAvatarUrl(data.avatar_url);
					if (data.persona_guess) setPersonaGuess(data.persona_guess);
					persistAvatarLocal(fp, data.avatar_url, data.persona_guess ?? null);
					setPhase("ready");
					return;
				}

				setAvatarUrl(null);
				setPersonaGuess(null);
				needsGenerationRef.current = true;
				setPhase("awaiting-captcha");
			} catch {
				if (cancelled) return;
				if (hadLocalAvatarRef.current) {
					setPhase("ready");
					return;
				}
				needsGenerationRef.current = true;
				setPhase("awaiting-captcha");
			}
		})();

		return () => {
			cancelled = true;
			clearTimeout(profileTimeoutId);
			profileController.abort();
		};
	}, []);

	// Clean up interval on unmount.
	useEffect(() => {
		return () => {
			if (obsTimerRef.current) clearInterval(obsTimerRef.current);
		};
	}, []);

	if (phase === "absent") return null;

	if (
		phase === "prefetching" ||
		phase === "awaiting-captcha" ||
		phase === "loading"
	) {
		return (
			<>
				{phase !== "prefetching" ? (
					<TurnstileGate onToken={handleToken} onError={handleCaptchaError} />
				) : null}
				<div
					className="home-fingerprint-avatar home-fingerprint-avatar--loading"
					role="status"
					aria-busy="true"
				>
					<div className="home-fingerprint-avatar-skeleton">
						<div className="home-fingerprint-avatar-shimmer-lines">
							<div className="home-fingerprint-avatar-shimmer-line home-fingerprint-avatar-shimmer-line--wide" />
							<div className="home-fingerprint-avatar-shimmer-line home-fingerprint-avatar-shimmer-line--medium" />
							<div className="home-fingerprint-avatar-shimmer-line home-fingerprint-avatar-shimmer-line--narrow" />
						</div>
					</div>
					{(phase === "loading" || phase === "prefetching") && (
						<p
							key={phase === "prefetching" ? "prefetch" : loadingStep}
							className="home-fingerprint-avatar-status"
							aria-live="polite"
						>
							{phase === "prefetching"
								? "Loading your portrait…"
								: STEP_MESSAGES[loadingStep]}
						</p>
					)}
					{observations.length > 0 && (
						<ul
							className="home-fingerprint-avatar-observations"
							aria-label="Observations about your browser signals"
						>
							{observations.slice(0, visibleObs).map((obs) => (
								<li key={obs} className="home-fingerprint-avatar-observation">
									{obs}
								</li>
							))}
						</ul>
					)}
				</div>
			</>
		);
	}

	if (!avatarUrl) return null;

	return (
		<div className="home-fingerprint-avatar">
			<div className="home-fingerprint-avatar-frame">
				{/* biome-ignore lint/performance/noImgElement: data: URIs are not supported by next/image */}
				<img
					src={avatarUrl}
					width={256}
					height={256}
					alt={AVATAR_LABEL}
					className="home-fingerprint-avatar-img"
					decoding="async"
				/>
			</div>
			{personaGuess && (
				<p className="home-fingerprint-avatar-persona">{personaGuess}</p>
			)}
			<p className="home-fingerprint-avatar-disclosure">
				Generated with OpenAI from your browser &amp; edge signals.{" "}
				<a href="/who-are-you">See what we know about you.</a>
			</p>
		</div>
	);
}
