"use client";

import posthog from "posthog-js";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { TurnstileGate } from "@/components/turnstile-gate";
import { canvasFingerprint } from "@/components/who-are-you/canvas-fingerprint";
import {
	formatUnifiedEngagementLog,
	type UnifiedEventLite,
} from "@/lib/engagement-summary";

const AVATAR_LABEL =
	"A personalised portrait generated from regional art traditions and your browser signals. Updates each calendar day.";

const LS_AVATAR_PREFIX = "jdetle.avatar.url";
const LS_PERSONA_PREFIX = "jdetle.avatar.persona";
const LS_HISTORY_PREFIX = "jdetle.avatar.history.v1";

type Phase =
	| "prefetching"
	| "awaiting-captcha"
	| "loading"
	| "ready"
	| "absent";
type LoadingStep = "fingerprint" | "region" | "artists" | "rendering";

const STEP_MESSAGES: Record<LoadingStep, string> = {
	fingerprint: "Gathering your browser signals…",
	region: "Detecting your region…",
	artists: "Composing your art direction…",
	rendering: "Rendering your portrait…",
};

function historyKey(fp: string): string {
	return `${LS_HISTORY_PREFIX}.${fp}`;
}

function isPngDataUri(s: string): boolean {
	return s.startsWith("data:image/png;base64,");
}

function loadHistory(fp: string): string[] {
	if (typeof window === "undefined") return [];
	try {
		const v1 = localStorage.getItem(historyKey(fp));
		if (v1) {
			const parsed = JSON.parse(v1) as unknown;
			if (Array.isArray(parsed)) {
				return parsed.filter((u) => typeof u === "string" && isPngDataUri(u));
			}
		}
		const leg = localStorage.getItem(`${LS_AVATAR_PREFIX}.${fp}`);
		if (leg && isPngDataUri(leg)) return [leg];
	} catch {
		/* private mode / corrupt */
	}
	return [];
}

function saveHistory(
	fp: string,
	urls: string[],
	persona: string | null,
): {
	urls: string[];
} {
	const next = Array.from(new Set(urls.filter((u) => isPngDataUri(u))));
	try {
		localStorage.setItem(historyKey(fp), JSON.stringify(next));
		if (next[0]) localStorage.setItem(`${LS_AVATAR_PREFIX}.${fp}`, next[0]);
		if (persona) localStorage.setItem(`${LS_PERSONA_PREFIX}.${fp}`, persona);
	} catch {
		// quota
	}
	return { urls: next };
}

/** Distinct UTC calendar days represented in merged analytics sample (warehouse + PostHog). */
function distinctUtcDaysFromEvents(
	events: Array<{ event_date?: string; event_time?: number }>,
): number {
	const days = new Set<string>();
	for (const e of events) {
		if (
			typeof e.event_date === "string" &&
			/^\d{4}-\d{2}-\d{2}$/.test(e.event_date)
		) {
			days.add(e.event_date);
			continue;
		}
		if (typeof e.event_time === "number" && Number.isFinite(e.event_time)) {
			days.add(new Date(e.event_time).toISOString().slice(0, 10));
		}
	}
	return days.size;
}

/**
 * Newest-first portrait list trimmed to at most one slide per distinct visit day
 * (when we have a positive day count from `/api/analytics/my-events`).
 */
function applyVisitDayCarouselCap(
	urls: string[],
	visitDayCount: number | null,
): string[] {
	if (!urls.length) return urls;
	if (visitDayCount == null || visitDayCount <= 0) return urls;
	return urls.slice(0, Math.min(urls.length, visitDayCount));
}

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
	/** Heuristic from edge-detect: IP in a common VPN exit hosting region. */
	vpn_exit_location_hint?: string;
	/** Merged PostHog + warehouse analytics summary for prompts (snake_case for Rust). */
	unified_engagement_log?: string;
}

async function fetchUnifiedEngagementLog(
	fp: string,
): Promise<string | undefined> {
	const params = new URLSearchParams();
	params.set("fingerprint", fp);
	params.set("limit", "100");
	const distinct = posthog.get_distinct_id?.();
	if (distinct) {
		params.set("distinct_id", distinct);
		params.set("user_id", distinct);
	}
	try {
		const url = new URL("/api/analytics/my-events", window.location.origin);
		params.forEach((value, key) => {
			url.searchParams.set(key, value);
		});
		const r = await fetch(url.href);
		if (!r.ok) return undefined;
		const data = (await r.json()) as { events?: unknown[] };
		const raw = Array.isArray(data.events) ? data.events : [];
		const events: UnifiedEventLite[] = raw.map((e) => {
			const row = e as Record<string, unknown>;
			return {
				event_type: typeof row.event_type === "string" ? row.event_type : "",
				source: typeof row.source === "string" ? row.source : "",
				page_url: typeof row.page_url === "string" ? row.page_url : "",
			};
		});
		return formatUnifiedEngagementLog(events);
	} catch {
		return undefined;
	}
}

function fpShortLabel(fp: string): string {
	return fp.length > 14 ? `${fp.slice(0, 12)}…` : fp;
}

function AvatarSignalPlaceholder({
	fpShort,
	ctx,
	interactionCount,
	eventsLoading,
}: {
	fpShort: string;
	ctx: UserContext;
	interactionCount: number | null;
	eventsLoading: boolean;
}) {
	const location = [ctx.city, ctx.region, ctx.country]
		.filter(Boolean)
		.join(", ");
	const dmRm = [
		ctx.dark_mode === true ? "dark UI" : null,
		ctx.reduced_motion === true ? "reduced motion" : null,
	]
		.filter(Boolean)
		.join(", ");

	const rows: { label: string; value: string }[] = [
		{ label: "Canvas fingerprint", value: fpShort },
	];
	if (location) rows.push({ label: "Approx. location", value: location });
	if (ctx.browser) rows.push({ label: "Browser", value: ctx.browser });
	if (ctx.os) rows.push({ label: "OS", value: ctx.os });
	if (ctx.device_type) rows.push({ label: "Device", value: ctx.device_type });
	if (ctx.screen) rows.push({ label: "Screen", value: ctx.screen });
	if (ctx.gpu) rows.push({ label: "GPU", value: ctx.gpu });
	if (ctx.timezone_browser)
		rows.push({ label: "Timezone", value: ctx.timezone_browser });
	if (ctx.languages) rows.push({ label: "Languages", value: ctx.languages });
	if (ctx.connection_type)
		rows.push({ label: "Connection", value: ctx.connection_type });
	if (ctx.referrer_type)
		rows.push({ label: "Referrer", value: ctx.referrer_type });
	if (ctx.utm) rows.push({ label: "UTM", value: ctx.utm });
	if (ctx.vpn_exit_location_hint)
		rows.push({ label: "VPN hint", value: ctx.vpn_exit_location_hint });
	if (dmRm) rows.push({ label: "Display prefs", value: dmRm });

	const countLabel = eventsLoading
		? "…"
		: interactionCount === null
			? "—"
			: String(interactionCount);
	rows.push({
		label: "Recorded interactions",
		value: `${countLabel} (merged analytics sample)`,
	});

	return (
		<section
			className="home-fingerprint-avatar-placeholder-panel"
			aria-labelledby="home-fingerprint-avatar-preview-title"
		>
			<p
				id="home-fingerprint-avatar-preview-title"
				className="home-fingerprint-avatar-placeholder-title"
			>
				Your signals (preview)
			</p>
			<dl className="home-fingerprint-avatar-placeholder-kv">
				{rows.map(({ label, value }) => (
					<div key={label} className="home-fingerprint-avatar-placeholder-row">
						<dt>{label}</dt>
						<dd>{value}</dd>
					</div>
				))}
			</dl>
		</section>
	);
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
				vpnExitLocationHeuristic?: {
					summary?: string;
					probabilityPercent?: number;
				} | null;
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
			if (data.vpnExitLocationHeuristic?.summary) {
				ctx.vpn_exit_location_hint = data.vpnExitLocationHeuristic.summary;
			}
		}
	} catch {
		// Edge detect is optional — continue without geo.
	}

	return ctx;
}

const OBSERVATION_INTERVAL_MS = 8_000;

function AvatarPortraitCarousel({
	urls,
	activeIndex,
	setIndex,
	bump,
}: {
	urls: string[];
	activeIndex: number;
	setIndex: (i: number) => void;
	bump: (delta: -1 | 1) => void;
}) {
	const n = urls.length;

	if (n === 0) return null;

	return (
		<section
			className="home-fingerprint-avatar-carousel"
			aria-label="Portrait history"
		>
			<div className="home-fingerprint-avatar-frame">
				{/* biome-ignore lint/performance/noImgElement: data: URIs are not supported by next/image */}
				<img
					src={urls[activeIndex]}
					width={256}
					height={256}
					alt={AVATAR_LABEL}
					className="home-fingerprint-avatar-img"
					decoding="async"
				/>
				{n > 1 && (
					<div className="home-fingerprint-avatar-carousel-btns">
						<button
							type="button"
							className="home-fingerprint-avatar-carousel-btn"
							onClick={() => bump(-1)}
							aria-label="Previous portrait in history"
						>
							‹
						</button>
						<button
							type="button"
							className="home-fingerprint-avatar-carousel-btn home-fingerprint-avatar-carousel-btn--next"
							onClick={() => bump(1)}
							aria-label="Next portrait in history"
						>
							›
						</button>
					</div>
				)}
			</div>
			{n > 1 && (
				<div
					className="home-fingerprint-avatar-dots"
					role="tablist"
					aria-label="Portrait position"
				>
					{urls.map((u, i) => (
						<button
							key={u}
							type="button"
							role="tab"
							aria-selected={i === activeIndex}
							aria-label={`Portrait ${i + 1} of ${n}`}
							className={
								i === activeIndex
									? "home-fingerprint-avatar-dot home-fingerprint-avatar-dot--active"
									: "home-fingerprint-avatar-dot"
							}
							onClick={() => setIndex(i)}
						/>
					))}
				</div>
			)}
		</section>
	);
}

export function HomeFingerprintAvatar() {
	const [fullAvatarUrls, setFullAvatarUrls] = useState<string[]>([]);
	const [visitDayCount, setVisitDayCount] = useState<number | null>(null);
	const [activeIndex, setActiveIndex] = useState(0);
	const [personaGuess, setPersonaGuess] = useState<string | null>(null);
	const [phase, setPhase] = useState<Phase>("prefetching");
	const [loadingStep, setLoadingStep] = useState<LoadingStep>("fingerprint");
	const [previewCtx, setPreviewCtx] = useState<UserContext | null>(null);
	const [previewReady, setPreviewReady] = useState(false);
	const [interactionCount, setInteractionCount] = useState<number | null>(null);
	const [eventsPreviewLoading, setEventsPreviewLoading] = useState(true);
	const [fpShort, setFpShort] = useState("—");
	const [observations, setObservations] = useState<string[]>([]);
	const [visibleObs, setVisibleObs] = useState(0);
	const requestedRef = useRef(false);
	const tokenRef = useRef<string | null>(null);
	const obsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const needsGenerationRef = useRef(false);
	const fullAvatarUrlsRef = useRef<string[]>([]);
	const visitDayCountRef = useRef<number | null>(null);

	useEffect(() => {
		fullAvatarUrlsRef.current = fullAvatarUrls;
	}, [fullAvatarUrls]);

	useEffect(() => {
		visitDayCountRef.current = visitDayCount;
	}, [visitDayCount]);

	const displayAvatarUrls = useMemo(
		() => applyVisitDayCarouselCap(fullAvatarUrls, visitDayCount),
		[fullAvatarUrls, visitDayCount],
	);

	const setIndex = useCallback(
		(i: number) => {
			if (displayAvatarUrls.length === 0) return;
			setActiveIndex(Math.max(0, Math.min(i, displayAvatarUrls.length - 1)));
		},
		[displayAvatarUrls.length],
	);

	const bumpSlide = useCallback(
		(d: -1 | 1) => {
			if (displayAvatarUrls.length <= 1) return;
			setActiveIndex(
				(i) => (i + d + displayAvatarUrls.length) % displayAvatarUrls.length,
			);
		},
		[displayAvatarUrls.length],
	);

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
			setLoadingStep("fingerprint");
			const [baseCtx, engagementLog] = await Promise.all([
				buildUserContext(),
				fetchUnifiedEngagementLog(fp),
			]);
			const userContext: UserContext = {
				...baseCtx,
				...(engagementLog ? { unified_engagement_log: engagementLog } : {}),
			};
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

			const recoverToCached = () => {
				const h = loadHistory(fp);
				if (h.length > 0) {
					setFullAvatarUrls(h);
					setActiveIndex(0);
					needsGenerationRef.current = true;
					setPhase("awaiting-captcha");
					return;
				}
				setPhase("absent");
			};

			try {
				const [gr] = await Promise.all([genPromise, obsPromise]);
				const gen = (await gr.json()) as {
					avatar_url?: string | null;
					avatar_urls?: string[] | null;
					persona_guess?: string | null;
				};

				stopObservationReveal();

				const cap = visitDayCountRef.current;
				const persist = (full: string[]) => {
					const forStorage = applyVisitDayCarouselCap(full, cap);
					saveHistory(fp, forStorage, gen.persona_guess ?? null);
				};

				if (Array.isArray(gen.avatar_urls) && gen.avatar_urls.length > 0) {
					const full = gen.avatar_urls.filter(
						(u) => typeof u === "string" && isPngDataUri(u),
					);
					setFullAvatarUrls(full);
					persist(full);
					setActiveIndex(0);
					if (gen.persona_guess) setPersonaGuess(gen.persona_guess);
					setPhase("ready");
				} else if (gen.avatar_url) {
					const prev = fullAvatarUrlsRef.current;
					const merged = [
						gen.avatar_url,
						...prev.filter((u) => u !== gen.avatar_url),
					].filter(isPngDataUri);
					const full = Array.from(new Set(merged));
					setFullAvatarUrls(full);
					persist(full);
					setActiveIndex(0);
					if (gen.persona_guess) setPersonaGuess(gen.persona_guess);
					setPhase("ready");
				} else {
					recoverToCached();
				}
			} catch {
				recoverToCached();
			} finally {
				requestedRef.current = false;
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

	useLayoutEffect(() => {
		const fp = canvasFingerprint();
		if (!fp || fp === "Canvas blocked") {
			setPhase("absent");
			return;
		}
		setFpShort(fpShortLabel(fp));
		const hist = loadHistory(fp);
		if (hist.length) {
			setFullAvatarUrls(hist);
			setActiveIndex(0);
		}
		try {
			const p = localStorage.getItem(`${LS_PERSONA_PREFIX}.${fp}`);
			if (p) setPersonaGuess(p);
		} catch {
			/* */
		}
	}, []);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			const fp = canvasFingerprint();
			if (!fp || fp === "Canvas blocked") {
				setPreviewReady(true);
				setEventsPreviewLoading(false);
				return;
			}

			try {
				const ctx = await buildUserContext();
				if (!cancelled) setPreviewCtx(ctx);
			} catch {
				/* non-fatal */
			}
			if (!cancelled) setPreviewReady(true);

			const params = new URLSearchParams();
			params.set("fingerprint", fp);
			params.set("limit", "100");
			const distinct = posthog.get_distinct_id?.();
			if (distinct) {
				params.set("distinct_id", distinct);
				params.set("user_id", distinct);
			}
			const url = new URL("/api/analytics/my-events", window.location.origin);
			params.forEach((value, key) => {
				url.searchParams.set(key, value);
			});

			try {
				const r = await fetch(url.href);
				const data = (await r.json()) as { events?: unknown[] };
				if (cancelled) return;
				const raw = Array.isArray(data.events) ? data.events : [];
				const n = raw.length;
				setInteractionCount(n);
				setVisitDayCount(
					distinctUtcDaysFromEvents(
						raw as Array<{ event_date?: string; event_time?: number }>,
					),
				);
			} catch {
				if (!cancelled) setInteractionCount(null);
			} finally {
				if (!cancelled) setEventsPreviewLoading(false);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, []);

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
					avatar_urls?: string[] | null;
					persona_guess?: string | null;
				};
				if (cancelled) return;

				const urlsFromServer =
					Array.isArray(data.avatar_urls) && data.avatar_urls.length > 0
						? data.avatar_urls.filter(
								(u) => typeof u === "string" && isPngDataUri(u),
							)
						: data.avatar_url
							? [data.avatar_url]
							: [];

				if (urlsFromServer.length) {
					setFullAvatarUrls(urlsFromServer);
					const forStorage = applyVisitDayCarouselCap(
						urlsFromServer,
						visitDayCountRef.current,
					);
					saveHistory(fp, forStorage, data.persona_guess ?? null);
					setActiveIndex(0);
					if (data.persona_guess) setPersonaGuess(data.persona_guess);
					setPhase("ready");
					return;
				}

				if (loadHistory(fp).length > 0) {
					needsGenerationRef.current = true;
					setPhase("awaiting-captcha");
					return;
				}

				setPersonaGuess(null);
				needsGenerationRef.current = true;
				setPhase("awaiting-captcha");
			} catch {
				if (cancelled) return;
				if (loadHistory(fp).length > 0) {
					needsGenerationRef.current = true;
					setPhase("awaiting-captcha");
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

	useEffect(() => {
		return () => {
			if (obsTimerRef.current) clearInterval(obsTimerRef.current);
		};
	}, []);

	useEffect(() => {
		setActiveIndex((i) => {
			if (displayAvatarUrls.length === 0) return 0;
			return Math.min(i, displayAvatarUrls.length - 1);
		});
	}, [displayAvatarUrls.length]);

	useEffect(() => {
		const fp = canvasFingerprint();
		if (!fp || fp === "Canvas blocked") return;
		if (fullAvatarUrls.length === 0) return;
		if (visitDayCount === null) return;
		saveHistory(
			fp,
			applyVisitDayCarouselCap(fullAvatarUrls, visitDayCount),
			personaGuess,
		);
	}, [fullAvatarUrls, visitDayCount, personaGuess]);

	if (phase === "absent") return null;

	const hasCache = displayAvatarUrls.length > 0;
	const isPrefetch = phase === "prefetching";
	const isCaptchaNoImage = phase === "awaiting-captcha" && !hasCache;
	const isCaptchaWithCache = phase === "awaiting-captcha" && hasCache;
	const isLoading = phase === "loading";

	if (isPrefetch && !previewReady) {
		return (
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
			</div>
		);
	}

	if (isPrefetch && previewReady) {
		const ctxForPreview = previewCtx ?? {};
		return (
			<div
				className="home-fingerprint-avatar home-fingerprint-avatar--prefetch-preview"
				role="status"
				aria-live="polite"
				aria-busy="true"
				aria-label="Loading profile portraits"
			>
				<AvatarSignalPlaceholder
					fpShort={fpShort}
					ctx={ctxForPreview}
					interactionCount={interactionCount}
					eventsLoading={eventsPreviewLoading}
				/>
				<p className="home-fingerprint-avatar-prefetch-hint">
					Loading portraits tied to your fingerprint…
				</p>
			</div>
		);
	}

	if (isCaptchaNoImage || (isLoading && !hasCache)) {
		return (
			<>
				<TurnstileGate onToken={handleToken} onError={handleCaptchaError} />
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
					{isLoading && (
						<p
							key={loadingStep}
							className="home-fingerprint-avatar-status"
							aria-live="polite"
						>
							{STEP_MESSAGES[loadingStep]}
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

	if (isCaptchaWithCache || (isLoading && hasCache)) {
		return (
			<>
				<div
					className={
						isLoading
							? "home-fingerprint-avatar home-fingerprint-avatar--with-cache home-fingerprint-avatar--loading"
							: "home-fingerprint-avatar home-fingerprint-avatar--with-cache"
					}
					role="status"
					aria-busy={isLoading}
				>
					<AvatarPortraitCarousel
						urls={displayAvatarUrls}
						activeIndex={activeIndex}
						setIndex={setIndex}
						bump={bumpSlide}
					/>
					{isLoading && (
						<p
							key={loadingStep}
							className="home-fingerprint-avatar-status"
							aria-live="polite"
						>
							{STEP_MESSAGES[loadingStep]}
						</p>
					)}
					{isCaptchaWithCache && !isLoading && (
						<p className="home-fingerprint-avatar-refresh-hint">
							Complete verification below to generate today’s portrait.
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
					{!isLoading && (
						<p className="home-fingerprint-avatar-disclosure">
							Generated with OpenAI from your browser &amp; edge signals.{" "}
							<a href="/who-are-you">See what we know about you.</a>
						</p>
					)}
				</div>
				<TurnstileGate onToken={handleToken} onError={handleCaptchaError} />
			</>
		);
	}

	if (phase === "ready" && hasCache) {
		return (
			<div className="home-fingerprint-avatar">
				<AvatarPortraitCarousel
					urls={displayAvatarUrls}
					activeIndex={activeIndex}
					setIndex={setIndex}
					bump={bumpSlide}
				/>
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

	return null;
}
