"use client";

import posthog from "posthog-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canvasFingerprint } from "@/components/who-are-you/canvas-fingerprint";
import {
	aggregateThirdPartyResources,
	computeExposureScore,
} from "@/lib/third-party-resources";
import { safeDecodeUriComponent } from "@/lib/url-display";
import type {
	ClientSignals,
	EdgeSignals,
	VpnAssessment,
	VpnSignal,
} from "@/lib/vpn-detect";
import { analyzeClientServerMismatch, computeVerdict } from "@/lib/vpn-detect";
import { EventHistoryViz } from "./event-history-viz";
import { ExposureMeter } from "./exposure-meter";
import { HeatmapGhostIllustration } from "./heatmap-ghost-illustration";
import { IdentityStitchingDiagram } from "./identity-stitching";
import { ProfileTicker } from "./profile-ticker";
import { ThirdPartyConstellation } from "./third-party-constellation";
import { TrackerCapabilityMatrix } from "./tracker-capability-matrix";

interface ServerGeo {
	ip: string | null;
	city: string | null;
	region: string | null;
	country: string | null;
	latitude: string | null;
	longitude: string | null;
	timezone: string | null;
}

interface EdgeInfo {
	pop: string | null;
	timestamp: string | null;
}

interface DetectedProfile {
	[key: string]: string | undefined;
}

interface EdgeApiResponse {
	edge: EdgeSignals & { pop: string | null; provider: string };
	vpnSignals: VpnSignal[];
	ipapi: Record<string, unknown> | null;
}

// ── Shared UI helpers ────────────────────────────────────────────────

function DetectRow({
	id,
	label,
	value,
}: {
	id: string;
	label: string;
	value: string | null;
}) {
	return (
		<div className="detect-row" id={`row-${id}`}>
			<dt>{label}</dt>
			<dd
				className={`detect-val ${!value ? "loading-pulse" : "detect-reveal"}`}
			>
				{value ?? "\u2026"}
			</dd>
		</div>
	);
}

function ConfidenceMeter({
	value,
	verdict,
}: {
	value: number;
	verdict: string;
}) {
	const colorClass =
		verdict === "residential"
			? "meter-green"
			: verdict === "likely-vpn" || verdict === "tor"
				? "meter-red"
				: "meter-amber";
	return (
		<div className="confidence-meter">
			<div className="meter-track">
				<div
					className={`meter-fill ${colorClass}`}
					style={{ width: `${Math.max(value, 4)}%` }}
				/>
			</div>
			<span className="meter-label">{value}% obfuscation confidence</span>
		</div>
	);
}

function PosthogSnapshotDd({
	loaded,
	analyticsTools,
	distinctIdDisplay,
	userEventsLength,
}: {
	loaded: boolean;
	analyticsTools: { name: string; active: boolean }[];
	distinctIdDisplay: string | null;
	userEventsLength: number;
}) {
	if (!loaded) return "\u2026";
	const phActive =
		analyticsTools.some((t) => t.name === "PostHog" && t.active) ||
		isPostHogSdkReady();
	if (phActive) {
		return (
			<>
				Distinct id{" "}
				<code className="persona-code">
					{maskDistinctId(distinctIdDisplay) ?? "pending"}
				</code>
				. <strong>{userEventsLength}</strong> event
				{userEventsLength === 1 ? "" : "s"} this demo can tie to this browser
				when the warehouse / API keys are configured &mdash; otherwise the count
				stays local to this page view.
			</>
		);
	}
	return (
		<>
			PostHog isn&apos;t active here (set{" "}
			<code className="persona-code">NEXT_PUBLIC_POSTHOG_KEY</code>). Event
			history below may be empty without keys.
		</>
	);
}

function VerdictBadge({ verdict }: { verdict: string }) {
	const labels: Record<string, string> = {
		residential: "Residential IP",
		"likely-vpn": "Likely VPN",
		datacenter: "Datacenter IP",
		tor: "Tor Network",
		proxy: "Possible Proxy",
		unknown: "Unknown",
	};
	return (
		<span className={`verdict-badge verdict-${verdict}`}>
			{labels[verdict] ?? verdict}
		</span>
	);
}

function SignalRow({ signal }: { signal: VpnSignal }) {
	return (
		<div
			className={`signal-row ${signal.detected ? "signal-triggered" : "signal-clear"}`}
		>
			<span className="signal-indicator">
				{signal.detected ? "\u26a0" : "\u2713"}
			</span>
			<span className="signal-name">{signal.name}</span>
			<span className="signal-detail">{signal.detail}</span>
			<span className="signal-weight">weight: {signal.weight}</span>
		</div>
	);
}

// ── Browser detection helpers ────────────────────────────────────────

function maskIP(ip: string): string {
	if (!ip) return "unavailable";
	const parts = ip.split(".");
	if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
	return ip.replace(/:[\da-f]+$/i, ":xxxx");
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
	return ua;
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
	if (ua.includes("CrOS")) return "ChromeOS";
	return "Unknown";
}

function guessDeviceType(): string {
	const w = screen.width;
	if (navigator.maxTouchPoints > 0 && w < 768) return "Mobile phone";
	if (navigator.maxTouchPoints > 0 && w >= 768 && w < 1200) return "Tablet";
	return "Desktop / Laptop";
}

function getGPU(): string {
	try {
		const c = document.createElement("canvas");
		const gl = c.getContext("webgl") || c.getContext("experimental-webgl");
		if (!gl || !(gl instanceof WebGLRenderingContext))
			return "WebGL unavailable";
		const ext = gl.getExtension("WEBGL_debug_renderer_info");
		if (!ext) return "GPU info restricted";
		return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;
	} catch {
		return "unavailable";
	}
}

async function detectWebRTCIPs(): Promise<string[]> {
	return new Promise((resolve) => {
		const ips: string[] = [];
		try {
			const pc = new RTCPeerConnection({
				iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
			});
			pc.createDataChannel("");
			pc.createOffer()
				.then((offer) => pc.setLocalDescription(offer))
				.catch(() => resolve([]));

			const timeout = setTimeout(() => {
				pc.close();
				resolve(ips);
			}, 3000);

			pc.onicecandidate = (e) => {
				if (!e.candidate) {
					clearTimeout(timeout);
					pc.close();
					resolve(ips);
					return;
				}
				const match = e.candidate.candidate.match(
					/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/,
				);
				if (match && !ips.includes(match[1])) ips.push(match[1]);
			};
		} catch {
			resolve([]);
		}
	});
}

function esc(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function classifyReferrer(url: string): string {
	if (!url) return "direct";
	try {
		const host = new URL(url).hostname.toLowerCase();
		if (
			host.includes("google.") ||
			host.includes("bing.com") ||
			host.includes("duckduckgo.com")
		)
			return "search";
		if (
			host.includes("twitter.com") ||
			host.includes("x.com") ||
			host.includes("t.co")
		)
			return "social:twitter";
		if (host.includes("linkedin.com")) return "social:linkedin";
		if (host.includes("reddit.com")) return "social:reddit";
		if (host.includes("news.ycombinator.com")) return "social:hackernews";
		if (host.includes("github.com")) return "social:github";
		if (host.includes("facebook.com")) return "social:facebook";
		return `other:${host}`;
	} catch {
		return "other";
	}
}

function maskDistinctId(id: string | null): string | null {
	if (!id) return null;
	if (id.length <= 12) return `${id.slice(0, 2)}\u2026`;
	return `${id.slice(0, 4)}\u2026${id.slice(-4)}`;
}

/** True when posthog-js is configured and returned a distinct id (bundled SDK, not window.posthog). */
function isPostHogSdkReady(): boolean {
	try {
		const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
		if (typeof key !== "string" || key.length === 0) return false;
		const id = posthog.get_distinct_id?.();
		return typeof id === "string" && id.length > 0;
	} catch {
		return false;
	}
}

function humanizeClass(cls: string): string {
	const map: Record<string, string> = {
		direct: "Direct visit",
		search: "Search engine",
		"social:twitter": "Twitter / X",
		"social:linkedin": "LinkedIn",
		"social:reddit": "Reddit",
		"social:hackernews": "Hacker News",
		"social:github": "GitHub",
		"social:facebook": "Facebook",
	};
	if (map[cls]) return map[cls];
	if (cls.startsWith("other:")) return `External (${cls.split(":")[1]})`;
	return cls;
}

// ── Main component ───────────────────────────────────────────────────

export function ClientProfile({
	serverGeo,
	edgeInfo,
}: {
	serverGeo: ServerGeo;
	edgeInfo: EdgeInfo;
}) {
	const [network, setNetwork] = useState<Record<string, string | null>>({});
	const [device, setDevice] = useState<Record<string, string | null>>({});
	const [capabilities, setCapabilities] = useState<
		Record<string, string | null>
	>({});
	const [fingerprint, setFingerprint] = useState<string | null>(null);
	const [referral, setReferral] = useState<Record<string, string | null>>({});
	const [analyticsTools, setAnalyticsTools] = useState<
		{ name: string; active: boolean }[]
	>([]);
	const [vpnAssessment, setVpnAssessment] = useState<VpnAssessment | null>(
		null,
	);
	const [edgeDetail, setEdgeDetail] = useState<Record<string, string | null>>(
		{},
	);
	const [summary, setSummary] = useState<string | null>(null);
	const [signalCount, setSignalCount] = useState(0);
	const [loaded, setLoaded] = useState(false);
	const [userEvents, setUserEvents] = useState<
		{
			event_id: string;
			event_type: string;
			source: string;
			page_url: string;
			event_date: string;
			event_time?: number;
		}[]
	>([]);
	const [userEventsLoading, setUserEventsLoading] = useState(false);
	const [userEventsError, setUserEventsError] = useState<string | null>(null);
	const [llmSummary, setLlmSummary] = useState<string | null>(null);
	const [personaGuess, setPersonaGuess] = useState<string | null>(null);
	const [avatarSvg, setAvatarSvg] = useState<string | null>(null);
	const avatarRequestedRef = useRef(false);
	const [thirdPartyHostCount, setThirdPartyHostCount] = useState(0);
	const [gtmPresent, setGtmPresent] = useState(false);
	const [distinctIdDisplay, setDistinctIdDisplay] = useState<string | null>(
		null,
	);

	const detectAll = useCallback(async () => {
		const profile: DetectedProfile = {};
		let signals = 0;
		const track = (key: string, val: string | null | undefined) => {
			if (val) {
				profile[key] = val;
				signals++;
			}
		};

		// ── 1. Fetch edge intelligence API ─────────────────────────────
		let edgeApi: EdgeApiResponse | null = null;
		try {
			const res = await fetch("/api/edge-detect");
			if (res.ok) edgeApi = (await res.json()) as EdgeApiResponse;
		} catch {
			/* edge API unavailable */
		}

		// ── 2. Network (combine Vercel headers + edge API) ─────────────
		const geoSource = edgeApi?.edge ?? serverGeo;
		const ip = geoSource.ip ? maskIP(geoSource.ip) : "hidden";
		const net: Record<string, string | null> = {
			ip,
			city: geoSource.city ?? null,
			region: geoSource.region ?? null,
			country:
				(edgeApi?.ipapi?.countryName as string) ?? geoSource.country ?? null,
			latitude: geoSource.latitude ?? null,
			longitude: geoSource.longitude ?? null,
			isp: edgeApi?.edge.org ?? "Detected server-side",
			org: edgeApi?.edge.org ?? "Detected server-side",
			timezone_ip: geoSource.timezone ?? null,
			asn: edgeApi?.edge.asn ?? null,
			network: (edgeApi?.ipapi?.network as string) ?? null,
		};
		setNetwork(net);
		for (const [k, v] of Object.entries(net)) track(k, v);

		// Edge metadata
		const pop = edgeApi?.edge.pop ?? edgeInfo.pop;
		const provider =
			edgeApi?.edge.provider ?? (edgeInfo.pop ? "vercel-edge" : "local");
		setEdgeDetail({
			pop: pop ?? "local",
			provider,
			timestamp: edgeInfo.timestamp
				? new Date(Number(edgeInfo.timestamp)).toISOString()
				: new Date().toISOString(),
			currency: (edgeApi?.ipapi?.currency as string) ?? null,
			postalCode: (edgeApi?.ipapi?.postalCode as string) ?? null,
			callingCode: (edgeApi?.ipapi?.countryCallingCode as string) ?? null,
			isEU: edgeApi?.edge.isEU ? "Yes" : "No",
		});

		// ── 3. Device ──────────────────────────────────────────────────
		const ua = navigator.userAgent;
		const dev = {
			browser: parseBrowser(ua),
			os: parseOS(ua),
			deviceType: guessDeviceType(),
			cores: navigator.hardwareConcurrency
				? `${navigator.hardwareConcurrency} cores`
				: "unavailable",
			ram:
				"deviceMemory" in navigator
					? `${(navigator as { deviceMemory: number }).deviceMemory} GB`
					: "unavailable",
			screen: `${screen.width} \u00d7 ${screen.height}`,
			viewport: `${window.innerWidth} \u00d7 ${window.innerHeight}`,
			dpr: `${window.devicePixelRatio}x${window.devicePixelRatio > 1 ? " (retina)" : ""}`,
			colorDepth: `${screen.colorDepth}-bit`,
			touch:
				navigator.maxTouchPoints > 0
					? `Yes (${navigator.maxTouchPoints} touch points)`
					: "No",
			gpu: getGPU(),
		};
		setDevice(dev);
		for (const [k, v] of Object.entries(dev)) track(k, v);

		// ── 4. Capabilities ────────────────────────────────────────────
		const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
		const languages = (navigator.languages || [navigator.language]).join(", ");
		const dnt =
			navigator.doNotTrack === "1"
				? "Enabled"
				: navigator.doNotTrack === "0"
					? "Disabled"
					: "Not set";
		const conn = (
			navigator as {
				connection?: {
					effectiveType?: string;
					downlink?: number;
					rtt?: number;
				};
			}
		).connection;
		let connectionStr = "API unavailable";
		let connectionRtt: number | null = null;
		if (conn) {
			connectionStr = conn.effectiveType ?? "unknown";
			if (conn.downlink) connectionStr += `, ${conn.downlink} Mbps`;
			if (conn.rtt) {
				connectionStr += `, ${conn.rtt}ms RTT`;
				connectionRtt = conn.rtt;
			}
		}

		const caps: Record<string, string | null> = {
			timezone: tz,
			languages,
			dnt,
			cookies: navigator.cookieEnabled ? "Yes" : "No",
			darkMode: window.matchMedia("(prefers-color-scheme: dark)").matches
				? "Preferred"
				: "Not preferred",
			reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
				.matches
				? "Reduce requested"
				: "No preference",
			connection: connectionStr,
			battery: null,
			webgl: (() => {
				try {
					const c = document.createElement("canvas");
					return c.getContext("webgl") || c.getContext("experimental-webgl")
						? "Supported"
						: "Not supported";
				} catch {
					return "Not supported";
				}
			})(),
			wasm: typeof WebAssembly === "object" ? "Supported" : "Not supported",
			sw: "serviceWorker" in navigator ? "Supported" : "Not supported",
		};
		setCapabilities(caps);
		for (const [k, v] of Object.entries(caps)) track(k, v);

		// Battery (async, non-blocking)
		if ("getBattery" in navigator) {
			(
				navigator as {
					getBattery: () => Promise<{ level: number; charging: boolean }>;
				}
			)
				.getBattery()
				.then((b) => {
					setCapabilities((prev) => ({
						...prev,
						battery: `${Math.round(b.level * 100)}%${b.charging ? " (charging)" : " (discharging)"}`,
					}));
				})
				.catch(() => {
					setCapabilities((prev) => ({ ...prev, battery: "denied" }));
				});
		} else {
			setCapabilities((prev) => ({ ...prev, battery: "API unavailable" }));
		}

		// ── 5. Fingerprint ─────────────────────────────────────────────
		const fp = canvasFingerprint();
		setFingerprint(fp);
		track("fingerprint", fp);
		// biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API not widely supported; needed for Vercel drain fingerprint
		document.cookie = `fingerprint=${encodeURIComponent(fp)}; path=/; max-age=31536000; SameSite=Lax`;

		// ── 6. Referral ────────────────────────────────────────────────
		const ref = document.referrer || sessionStorage.getItem("_referrer") || "";
		const refClass = classifyReferrer(ref);
		const params = new URLSearchParams(window.location.search);
		const utmObj: Record<string, string> = {};
		for (const k of [
			"utm_source",
			"utm_medium",
			"utm_campaign",
			"utm_term",
			"utm_content",
		]) {
			const v = params.get(k);
			if (v) utmObj[k] = v;
		}
		if (!Object.keys(utmObj).length) {
			const utmRaw = sessionStorage.getItem("_utm");
			if (utmRaw)
				try {
					Object.assign(utmObj, JSON.parse(utmRaw));
				} catch {
					/* empty */
				}
		}
		setReferral({
			referrer: ref || "Direct (no referrer)",
			referrerType: humanizeClass(refClass),
			utm: Object.keys(utmObj).length
				? Object.entries(utmObj)
						.map(([k, v]) => `${k.replace("utm_", "")}: ${v}`)
						.join(" \u00b7 ")
				: "None",
		});
		track("referrer", ref || "direct");

		// ── 7. VPN / proxy assessment ──────────────────────────────────
		const webrtcIPs = await detectWebRTCIPs();

		const edgeSignalsForVpn: EdgeSignals = {
			ip: edgeApi?.edge.ip ?? serverGeo.ip,
			city: edgeApi?.edge.city ?? serverGeo.city,
			region: edgeApi?.edge.region ?? serverGeo.region,
			country: edgeApi?.edge.country ?? serverGeo.country,
			latitude: edgeApi?.edge.latitude ?? serverGeo.latitude,
			longitude: edgeApi?.edge.longitude ?? serverGeo.longitude,
			timezone: edgeApi?.edge.timezone ?? serverGeo.timezone,
			asn: edgeApi?.edge.asn ?? null,
			org: edgeApi?.edge.org ?? null,
			isEU: edgeApi?.edge.isEU ?? false,
		};

		const clientSignals: ClientSignals = {
			browserTimezone: tz,
			browserLanguages: navigator.languages
				? [...navigator.languages]
				: [navigator.language],
			screenWidth: screen.width,
			screenHeight: screen.height,
			devicePixelRatio: window.devicePixelRatio,
			hardwareConcurrency: navigator.hardwareConcurrency ?? 0,
			maxTouchPoints: navigator.maxTouchPoints ?? 0,
			webrtcIPs,
			connectionType: conn?.effectiveType ?? null,
			connectionRtt,
		};

		const serverSignals = edgeApi?.vpnSignals ?? [];
		const clientServerSignals = analyzeClientServerMismatch(
			edgeSignalsForVpn,
			clientSignals,
		);
		const allSignals = [...serverSignals, ...clientServerSignals];
		const assessment = computeVerdict(allSignals);
		setVpnAssessment(assessment);
		posthog.capture("vpn_verdict_shown", {
			verdict: assessment.verdict,
			confidence: assessment.confidence,
		});

		// ── 8. Analytics tools (delayed) ───────────────────────────────
		setTimeout(() => {
			setAnalyticsTools([
				{
					name: "Google Analytics 4",
					active:
						!!window.gtag || !!(window as { dataLayer?: unknown }).dataLayer,
				},
				{
					name: "Microsoft Clarity",
					active: !!(window as { clarity?: unknown }).clarity,
				},
				{
					name: "Plausible",
					active: !!(window as { plausible?: unknown }).plausible,
				},
				{
					name: "PostHog",
					active: isPostHogSdkReady(),
				},
				{
					name: "Vercel Analytics",
					active: !!document.querySelector('script[src*="_vercel/insights"]'),
				},
			]);
		}, 1600);

		setSignalCount(signals);

		// ── 9. Summary ─────────────────────────────────────────────────
		setTimeout(() => {
			const parts: string[] = [];
			if (profile.city && profile.country)
				parts.push(
					`You appear to be in <strong>${esc(profile.city)}, ${esc(profile.country)}</strong>.`,
				);
			if (profile.browser && profile.os) {
				let s = `You're using <strong>${esc(profile.browser)}</strong> on <strong>${esc(profile.os)}</strong>`;
				if (profile.deviceType)
					s += ` (${esc(profile.deviceType).toLowerCase()})`;
				parts.push(`${s}.`);
			}
			if (
				profile.gpu &&
				profile.gpu !== "unavailable" &&
				profile.gpu !== "GPU info restricted"
			) {
				let s = `Your GPU is a <strong>${esc(profile.gpu)}</strong>`;
				if (profile.cores) s += ` paired with ${esc(profile.cores)}`;
				if (profile.ram) s += ` and ${esc(profile.ram)} of memory`;
				parts.push(`${s}.`);
			}
			if (profile.screen) {
				let s = `Your screen is <strong>${esc(profile.screen)}</strong>`;
				if (profile.dpr) s += ` at ${esc(profile.dpr)} density`;
				parts.push(`${s}.`);
			}
			if (profile.timezone) {
				let s = `Your clock says it's <strong>${esc(profile.timezone)}</strong>`;
				if (profile.languages)
					s += ` and you prefer <strong>${esc(profile.languages.split(",")[0].trim())}</strong>`;
				parts.push(`${s}.`);
			}
			if (profile.darkMode === "Preferred")
				parts.push("You prefer <strong>dark mode</strong>.");
			if (profile.adblock === "Detected")
				parts.push(
					"You're running an <strong>ad blocker</strong> &mdash; wise choice.",
				);
			if (profile.dnt === "Enabled")
				parts.push("You've enabled <strong>Do Not Track</strong>.");
			if (profile.fingerprint)
				parts.push(
					`Your canvas fingerprint is <code>${esc(profile.fingerprint)}</code> &mdash; a nearly unique identifier derived from how your browser renders graphics.`,
				);

			// Add VPN verdict to summary
			if (assessment.verdict === "residential") {
				parts.push(
					"Your connection appears to come from a <strong>standard residential IP</strong> &mdash; no VPN or proxy detected.",
				);
			} else if (assessment.verdict === "likely-vpn") {
				parts.push(
					"Your connection shows <strong>strong indicators of VPN usage</strong>.",
				);
			} else if (assessment.verdict === "tor") {
				parts.push(
					"You appear to be using the <strong>Tor anonymity network</strong>.",
				);
			} else if (assessment.verdict === "datacenter") {
				parts.push(
					"Your IP belongs to a <strong>datacenter</strong>, not a residential ISP.",
				);
			} else if (assessment.verdict === "proxy") {
				parts.push(
					"Some signals suggest your traffic may be passing through a <strong>proxy</strong>.",
				);
			}

			setSummary(
				parts.join(" ") || "Could not gather enough data to build a profile.",
			);
			posthog.capture("profile_detection_complete", {
				signal_count: signals,
				referrer_type: refClass,
				verdict: assessment.verdict,
			});
			setLoaded(true);
		}, 2500);
	}, [serverGeo, edgeInfo]);

	useEffect(() => {
		detectAll();
	}, [detectAll]);

	useEffect(() => {
		if (!loaded) return;
		const distinctId = posthog.get_distinct_id?.();
		const fp = fingerprint;

		setUserEventsLoading(true);
		setUserEventsError(null);
		const url = new URL("/api/analytics/my-events", window.location.origin);
		if (fp) url.searchParams.set("fingerprint", fp);
		if (distinctId) url.searchParams.set("distinct_id", distinctId);
		if (distinctId) url.searchParams.set("user_id", distinctId);
		url.searchParams.set("limit", "50");
		if (!distinctId && !fp) {
			setUserEventsLoading(false);
			return;
		}
		fetch(url.href)
			.then((r) => {
				if (!r.ok) throw new Error(`API returned ${r.status}`);
				return r.json();
			})
			.then(
				(data: {
					events?: {
						event_id: string;
						event_type: string;
						source: string;
						page_url: string;
						event_date: string;
						event_time?: number;
					}[];
				}) => {
					const events = data.events ?? [];
					setUserEvents(events);
					// Sync aggregated events to Meta Conversions API for ad optimization
					if ((fp ?? distinctId) && events.length > 0) {
						fetch("/api/analytics/meta-sync", {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({
								fingerprint: fp || undefined,
								distinct_id: distinctId || undefined,
								user_id: distinctId || undefined,
								events,
							}),
							keepalive: true,
						}).catch(() => {});
					}
				},
			)
			.catch((e) =>
				setUserEventsError(
					e instanceof Error ? e.message : "Failed to load events",
				),
			)
			.finally(() => setUserEventsLoading(false));
	}, [loaded, fingerprint]);

	useEffect(() => {
		const t = window.setTimeout(() => {
			try {
				const origin = window.location.origin;
				const entries = performance.getEntriesByType(
					"resource",
				) as PerformanceResourceTiming[];
				setThirdPartyHostCount(
					aggregateThirdPartyResources(origin, entries).length,
				);
			} catch {
				setThirdPartyHostCount(0);
			}
		}, 2100);
		return () => window.clearTimeout(t);
	}, []);

	useEffect(() => {
		if (!loaded) return;
		const t = window.setTimeout(() => {
			setGtmPresent(
				!!(window as { google_tag_manager?: unknown }).google_tag_manager,
			);
			setDistinctIdDisplay(posthog.get_distinct_id?.() ?? null);
		}, 400);
		return () => window.clearTimeout(t);
	}, [loaded]);

	const exposureScore = useMemo(() => {
		if (!vpnAssessment) return null;
		return computeExposureScore({
			activeTrackerCount: analyticsTools.filter((x) => x.active).length,
			thirdPartyHostCount,
			storedEventCount: userEvents.length,
			vpnVerdict: vpnAssessment.verdict,
			vpnConfidence: vpnAssessment.confidence,
		});
	}, [vpnAssessment, analyticsTools, userEvents.length, thirdPartyHostCount]);

	const agreementSignals = useMemo(() => {
		if (!vpnAssessment) return [];
		const wanted = new Set([
			"Timezone–country mismatch",
			"Timezone region mismatch",
			"Language–country mismatch",
			"WebRTC IP leak",
		]);
		return vpnAssessment.signals.filter((s) => wanted.has(s.name));
	}, [vpnAssessment]);

	const likelyLocation = useMemo(() => {
		const parts = [network.city, network.region, network.country]
			.filter(Boolean)
			.map((part) => safeDecodeUriComponent(part as string));
		return parts.length ? parts.join(", ") : null;
	}, [network.city, network.region, network.country]);

	const googleMapsUrl = useMemo(() => {
		const lat = network.latitude?.trim();
		const lon = network.longitude?.trim();
		const query = lat && lon ? `${lat},${lon}` : likelyLocation;
		if (!query) return null;
		return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
	}, [likelyLocation, network.latitude, network.longitude]);

	const googleMapsEmbedUrl = useMemo(() => {
		const lat = network.latitude?.trim();
		const lon = network.longitude?.trim();
		const query = lat && lon ? `${lat},${lon}` : likelyLocation;
		if (!query) return null;
		return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
	}, [likelyLocation, network.latitude, network.longitude]);

	const deviceContextLine = useMemo(() => {
		const parts = [device.browser, device.os, device.deviceType].filter(
			Boolean,
		) as string[];
		return parts.length ? parts.join(" · ") : null;
	}, [device.browser, device.os, device.deviceType]);

	// Fetch LLM summary + stored avatar; if none, request generation (Anthropic → SVG stored in DB)
	useEffect(() => {
		if (!loaded) return;
		const distinctId = posthog.get_distinct_id?.();
		const fp = fingerprint;
		if (!distinctId && !fp) return;

		let cancelled = false;

		void (async () => {
			const url = new URL(
				"/api/analytics/user-profile",
				window.location.origin,
			);
			if (fp) url.searchParams.set("fingerprint", fp);
			if (distinctId) url.searchParams.set("distinct_id", distinctId);
			if (distinctId) url.searchParams.set("user_id", distinctId);

			try {
				const r = await fetch(url.href);
				const data = (await r.json()) as {
					summary?: string | null;
					persona_guess?: string | null;
					avatar_svg?: string | null;
				};
				if (cancelled) return;
				if (data.summary) setLlmSummary(data.summary);
				if (data.persona_guess) setPersonaGuess(data.persona_guess);
				if (data.avatar_svg) setAvatarSvg(data.avatar_svg);

				if (data.avatar_svg || avatarRequestedRef.current || !fp) return;
				avatarRequestedRef.current = true;

				const gr = await fetch("/api/analytics/generate-avatar", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						fingerprint: fp,
						distinct_id: distinctId ?? undefined,
						user_id: distinctId ?? undefined,
					}),
				});
				const gen = (await gr.json()) as {
					persona_guess?: string;
					avatar_svg?: string;
				};
				if (cancelled) return;
				if (gen.avatar_svg) {
					setAvatarSvg(gen.avatar_svg);
					setPersonaGuess(gen.persona_guess ?? null);
				}
			} catch {
				/* analytics optional */
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [loaded, fingerprint]);

	return (
		<>
			<div className={`profile-status ${loaded ? "profile-hidden" : ""}`}>
				Gathering data&hellip;
			</div>
			<div className={`profile-status ${loaded ? "" : "profile-hidden"}`}>
				Analysis complete. {signalCount} signals detected.
			</div>

			{loaded ? (
				<nav className="persona-toc" aria-label="On this page">
					<span className="persona-toc-label">On this page</span>
					<a href="#inferred-snapshot">Inferred snapshot</a>
					<a href="#signal-agreement">Signal agreement</a>
					<a href="#commercial-tracking">Tracking surface</a>
					<a href="#origin-intelligence">Origin intelligence</a>
					<a href="#network-location">Network &amp; location</a>
					<a href="#device-hardware">Device</a>
				</nav>
			) : null}

			{/* ── Inferred snapshot ───────────────────────────────────────── */}
			<section
				id="inferred-snapshot"
				className="detect-section persona-snapshot-section"
			>
				<h2>Inferred snapshot</h2>
				<p className="detect-note">
					A structured readout from data this page already collected &mdash;
					pseudonymous, not your name.
				</p>
				<dl className="persona-snapshot">
					<div className="persona-row">
						<dt>Likely location</dt>
						<dd>
							<span>
								{likelyLocation ??
									(network.country ? network.country : "\u2026")}
								{googleMapsUrl ? (
									<span className="persona-row-sub">
										{" "}
										&middot;{" "}
										<a href={googleMapsUrl} target="_blank" rel="noreferrer">
											View on Google Maps
										</a>
									</span>
								) : null}
							</span>
							{googleMapsEmbedUrl ? (
								<div className="persona-map-preview">
									<iframe
										title={`Map preview for ${likelyLocation ?? "detected location"}`}
										src={googleMapsEmbedUrl}
										loading="lazy"
										referrerPolicy="no-referrer-when-downgrade"
										allowFullScreen
									/>
								</div>
							) : null}
						</dd>
					</div>
					<div className="persona-row">
						<dt>Likely device &amp; context</dt>
						<dd>
							{deviceContextLine ? (
								<>
									{deviceContextLine}
									{device.screen ? (
										<>
											{" "}
											<span className="persona-row-sub">
												Screen {device.screen}
												{device.viewport
													? ` · viewport ${device.viewport}`
													: ""}
											</span>
										</>
									) : null}
								</>
							) : (
								"\u2026"
							)}
						</dd>
					</div>
					<div className="persona-row">
						<dt>Language &amp; locale</dt>
						<dd>
							{capabilities.languages && capabilities.timezone ? (
								<>
									{capabilities.languages.split(",")[0]?.trim()}
									<span className="persona-row-sub">
										{" "}
										&middot; {capabilities.timezone}
									</span>
								</>
							) : (
								"\u2026"
							)}
						</dd>
					</div>
					<div className="persona-row">
						<dt>Connection story</dt>
						<dd>
							{vpnAssessment ? (
								<>
									<VerdictBadge verdict={vpnAssessment.verdict} />
									{" \u2014 "}
									{vpnAssessment.summary}
								</>
							) : (
								"\u2026"
							)}
						</dd>
					</div>
					<div className="persona-row">
						<dt>Identifier stability</dt>
						<dd>
							{fingerprint ? (
								<>
									Canvas hash{" "}
									<code className="persona-code">{fingerprint}</code> &mdash; a
									pseudonymous device sketch, not an ID document.
								</>
							) : (
								"\u2026"
							)}
						</dd>
					</div>
					<div className="persona-row">
						<dt>How you arrived</dt>
						<dd>
							{referral.referrerType ? (
								<>
									{referral.referrerType}
									{referral.utm && referral.utm !== "None" ? (
										<span className="persona-row-sub">
											{" "}
											&middot; {referral.utm}
										</span>
									) : null}
								</>
							) : (
								"\u2026"
							)}
						</dd>
					</div>
					<div className="persona-row">
						<dt>PostHog / events</dt>
						<dd>
							<PosthogSnapshotDd
								loaded={loaded}
								analyticsTools={analyticsTools}
								distinctIdDisplay={distinctIdDisplay}
								userEventsLength={userEvents.length}
							/>
						</dd>
					</div>
				</dl>
			</section>

			{/* ── Signal agreement ─────────────────────────────────────── */}
			<section id="signal-agreement" className="detect-section">
				<h2>Signal agreement</h2>
				<p className="detect-note">
					Cross-checks between browser hints and network-visible signals.
					Triggered rows are not proof of malice &mdash; they flag mismatch.
				</p>
				{agreementSignals.length > 0 ? (
					<div className="signal-agreement-strip">
						{agreementSignals.map((s) => (
							<div
								key={s.name}
								className={`signal-agreement-item ${s.detected ? "signal-mismatch" : "signal-match"}`}
							>
								<span className="signal-agreement-icon" aria-hidden="true">
									{s.detected ? "\u26a0" : "\u2713"}
								</span>
								<div className="signal-agreement-body">
									<span className="signal-agreement-name">{s.name}</span>
									<span className="signal-agreement-detail">{s.detail}</span>
								</div>
							</div>
						))}
					</div>
				) : loaded ? (
					<p className="detect-note">
						No timezone/language/WebRTC agreement rows for this session (often
						needs edge country plus browser timezone/languages).
					</p>
				) : null}
			</section>

			{/* ── Commercial tracking surface (exposure) ───────────────── */}
			{vpnAssessment && exposureScore !== null ? (
				<section id="commercial-tracking" className="detect-section">
					<h2>Commercial tracking surface</h2>
					<p className="detect-note">
						Composite score from trackers, third-party hosts, stored events, and
						VPN signals.
					</p>
					<ExposureMeter value={exposureScore} />
				</section>
			) : null}

			{/* ── Origin Intelligence ────────────────────────────────────── */}
			<section id="origin-intelligence" className="detect-section origin-intel">
				<h2>Origin Intelligence</h2>
				<p className="detect-note">
					Server-side analysis from the edge node closest to you
				</p>

				{vpnAssessment && (
					<div className="vpn-verdict-card">
						<div className="verdict-header">
							<VerdictBadge verdict={vpnAssessment.verdict} />
							<ConfidenceMeter
								value={vpnAssessment.confidence}
								verdict={vpnAssessment.verdict}
							/>
						</div>
						<p className="verdict-summary">{vpnAssessment.summary}</p>
					</div>
				)}

				<dl className="detect-grid">
					<DetectRow
						id="edge-pop"
						label="Edge node (POP)"
						value={edgeDetail.pop ?? null}
					/>
					<DetectRow
						id="edge-provider"
						label="Edge provider"
						value={edgeDetail.provider ?? null}
					/>
					<DetectRow
						id="edge-time"
						label="Edge timestamp"
						value={edgeDetail.timestamp ?? null}
					/>
					<DetectRow id="asn" label="ASN" value={network.asn ?? null} />
					<DetectRow
						id="org"
						label="Network organization"
						value={network.org ?? null}
					/>
					<DetectRow
						id="network-range"
						label="Network range"
						value={network.network ?? null}
					/>
					<DetectRow
						id="postal"
						label="Postal code"
						value={edgeDetail.postalCode ?? null}
					/>
					<DetectRow
						id="currency"
						label="Local currency"
						value={edgeDetail.currency ?? null}
					/>
					<DetectRow
						id="calling-code"
						label="Country calling code"
						value={edgeDetail.callingCode ?? null}
					/>
					<DetectRow
						id="eu-member"
						label="EU member state"
						value={edgeDetail.isEU ?? null}
					/>
				</dl>

				{vpnAssessment && vpnAssessment.signals.length > 0 && (
					<div className="signal-breakdown">
						<h3>Signal Breakdown</h3>
						<p className="detect-note">
							Each signal contributes a weighted score. Triggered signals
							increase the obfuscation confidence.
						</p>
						{vpnAssessment.signals.map((s) => (
							<SignalRow key={s.name} signal={s} />
						))}
					</div>
				)}
			</section>

			{/* ── Network & Location ────────────────────────────────────── */}
			<section id="network-location" className="detect-section">
				<h2>Network &amp; Location</h2>
				<p className="detect-note">
					{serverGeo.city
						? "Via Vercel Edge geo headers (server-side)"
						: "Via IP geolocation lookup"}
				</p>
				<dl className="detect-grid">
					<DetectRow id="ip" label="IP address" value={network.ip ?? null} />
					<DetectRow id="city" label="City" value={network.city ?? null} />
					<DetectRow
						id="region"
						label="Region"
						value={network.region ?? null}
					/>
					<DetectRow
						id="country"
						label="Country"
						value={network.country ?? null}
					/>
					<DetectRow id="isp" label="ISP" value={network.isp ?? null} />
					<DetectRow
						id="timezone-ip"
						label="Timezone (IP)"
						value={network.timezone_ip ?? null}
					/>
				</dl>
			</section>

			{/* ── Device & Hardware ─────────────────────────────────────── */}
			<section id="device-hardware" className="detect-section">
				<h2>Device &amp; Hardware</h2>
				<p className="detect-note">From Navigator and Screen APIs</p>
				<dl className="detect-grid">
					<DetectRow
						id="browser"
						label="Browser"
						value={device.browser ?? null}
					/>
					<DetectRow
						id="os"
						label="Operating system"
						value={device.os ?? null}
					/>
					<DetectRow
						id="device-type"
						label="Device type"
						value={device.deviceType ?? null}
					/>
					<DetectRow id="cpu" label="CPU cores" value={device.cores ?? null} />
					<DetectRow
						id="ram"
						label="Device memory"
						value={device.ram ?? null}
					/>
					<DetectRow
						id="screen-res"
						label="Screen resolution"
						value={device.screen ?? null}
					/>
					<DetectRow
						id="viewport"
						label="Viewport"
						value={device.viewport ?? null}
					/>
					<DetectRow
						id="dpr"
						label="Pixel ratio (retina)"
						value={device.dpr ?? null}
					/>
					<DetectRow
						id="color-depth"
						label="Color depth"
						value={device.colorDepth ?? null}
					/>
					<DetectRow
						id="touch"
						label="Touch support"
						value={device.touch ?? null}
					/>
					<DetectRow id="gpu" label="GPU" value={device.gpu ?? null} />
				</dl>
			</section>

			{/* ── Browser Capabilities ──────────────────────────────────── */}
			<section className="detect-section">
				<h2>Browser Capabilities</h2>
				<p className="detect-note">Feature detection and preference queries</p>
				<dl className="detect-grid">
					<DetectRow
						id="timezone"
						label="Timezone"
						value={capabilities.timezone ?? null}
					/>
					<DetectRow
						id="languages"
						label="Languages"
						value={capabilities.languages ?? null}
					/>
					<DetectRow
						id="dnt"
						label="Do Not Track"
						value={capabilities.dnt ?? null}
					/>
					<DetectRow
						id="cookies"
						label="Cookies enabled"
						value={capabilities.cookies ?? null}
					/>
					<DetectRow
						id="darkmode"
						label="Dark mode"
						value={capabilities.darkMode ?? null}
					/>
					<DetectRow
						id="reducedmotion"
						label="Reduced motion"
						value={capabilities.reducedMotion ?? null}
					/>
					<DetectRow
						id="connection"
						label="Connection"
						value={capabilities.connection ?? null}
					/>
					<DetectRow
						id="battery"
						label="Battery"
						value={capabilities.battery ?? null}
					/>
					<DetectRow
						id="webgl"
						label="WebGL"
						value={capabilities.webgl ?? null}
					/>
					<DetectRow
						id="wasm"
						label="WebAssembly"
						value={capabilities.wasm ?? null}
					/>
					<DetectRow
						id="sw"
						label="Service Workers"
						value={capabilities.sw ?? null}
					/>
				</dl>
			</section>

			{/* ── Canvas Fingerprint ────────────────────────────────────── */}
			<section className="detect-section">
				<h2>Canvas Fingerprint</h2>
				<p className="detect-note">
					A hash derived from how your browser renders graphics &mdash; nearly
					unique to your device
				</p>
				<dl className="detect-grid">
					<DetectRow
						id="canvas-hash"
						label="Fingerprint hash"
						value={fingerprint}
					/>
				</dl>
			</section>

			{/* ── Identity stitching (illustrative) ─────────────────────── */}
			<section className="detect-section">
				<h2>How identifiers stitch together</h2>
				<IdentityStitchingDiagram
					canvasFingerprint={fingerprint}
					distinctId={distinctIdDisplay}
					hasFirstPartyCookie={
						typeof document !== "undefined" &&
						document.cookie.includes("fingerprint=")
					}
				/>
			</section>

			{/* ── How You Got Here ──────────────────────────────────────── */}
			<section className="detect-section">
				<h2>How You Got Here</h2>
				<p className="detect-note">Referrer header and URL parameters</p>
				<dl className="detect-grid">
					<DetectRow
						id="referrer"
						label="Referrer"
						value={referral.referrer ?? null}
					/>
					<DetectRow
						id="ref-class"
						label="Referrer type"
						value={referral.referrerType ?? null}
					/>
					<DetectRow id="utm" label="UTM tags" value={referral.utm ?? null} />
				</dl>
			</section>

			{/* ── Third-party request map ───────────────────────────────── */}
			<section className="detect-section">
				<h2>Third-party request map</h2>
				<ThirdPartyConstellation />
			</section>

			{/* ── Tracker capability matrix (documented) ─────────────────── */}
			<section className="detect-section">
				<h2>What common analytics tools can do</h2>
				<TrackerCapabilityMatrix />
				<HeatmapGhostIllustration />
			</section>

			{/* ── How to reduce what sites know ───────────────────────────── */}
			<section className="detect-section anti-tracking-tips">
				<h2>How to reduce what sites know</h2>
				<p className="detect-note">
					You can make it harder for sites to identify you. These tools work
					without technical know-how:
				</p>
				<ul className="anti-tracking-list">
					<li>
						<strong>uBlock Origin</strong> — Free browser extension that blocks
						trackers and ads. Works in Chrome, Firefox, Edge.
					</li>
					<li>
						<strong>Firefox Strict mode</strong> — Built-in. Open Settings →
						Privacy &amp; Security → Enhanced Tracking Protection → Strict.
					</li>
					<li>
						<strong>Brave browser</strong> — Blocks trackers by default. Good
						option if you want privacy without installing extensions.
					</li>
					<li>
						<strong>DuckDuckGo</strong> — Search engine that doesn&apos;t track
						you. Use it instead of Google for search.
					</li>
					<li>
						<strong>Private/Incognito windows</strong> — Don&apos;t rely on them
						alone (fingerprints still work), but they help avoid cookie-based
						tracking.
					</li>
				</ul>
			</section>

			{/* ── Analytics Tools ───────────────────────────────────────── */}
			<section className="detect-section">
				<h2>Analytics Tools Watching You</h2>
				<p className="detect-note">Scripts currently loaded on this page</p>
				<ul className="analytics-list">
					{analyticsTools.map((t) => (
						<li key={t.name} className="analytics-item">
							<span
								className={`analytics-dot ${t.active ? "dot-active" : "dot-inactive"}`}
							/>
							<span>{t.name}</span>
							<span className="analytics-status">
								{t.active ? "Active" : "Not loaded"}
							</span>
						</li>
					))}
				</ul>
				{gtmPresent ? (
					<p className="detect-note gtm-callout">
						<strong>Google Tag Manager</strong> is present. It can load
						additional tags not listed here &mdash; treat the list above as a{" "}
						<strong>lower bound</strong>.
					</p>
				) : null}
			</section>

			{/* ── Profile Ticker (picture building) ─────────────────────────── */}
			<section className="detect-section">
				<h2>Your Picture (building as you browse)</h2>
				<p className="detect-note">
					Not a photograph — a <strong>running sketch</strong> built from what
					analytics already log: which pages you opened, roughly when, and what
					kind of action it was. You don&apos;t have to type your name; that
					trail alone is still enough for stats, campaign measurement, and
					follow-up ads elsewhere.
				</p>
				<p className="detect-note">
					Below, each line is one stored event, tied to this browser the same
					way the site usually does it (visitor id from the analytics cookie
					plus the fingerprint shown above). The strip scrolls like a news
					ticker; the more you browse, the longer the sketch gets.
				</p>
				<ProfileTicker events={userEvents} loading={userEventsLoading} />
			</section>

			{/* ── Your Event History ─────────────────────────────────────── */}
			<section className="detect-section">
				<h2>Your Event History</h2>
				<p className="detect-note">
					Same events as above, in a list: pulled from the site analytics
					pipeline and matched to this browser.
				</p>
				{userEventsLoading && <p className="detect-note">Loading&hellip;</p>}
				{userEventsError && (
					<p className="detect-note" style={{ color: "var(--error, #dc2626)" }}>
						{userEventsError}
					</p>
				)}
				{!userEventsLoading && !userEventsError && userEvents.length === 0 && (
					<p className="detect-note">
						No events found yet. Visit a few pages and check back.
					</p>
				)}
				{!userEventsLoading && !userEventsError && userEvents.length > 0 && (
					<EventHistoryViz events={userEvents} />
				)}
			</section>

			{/* ── Composite Summary ─────────────────────────────────────── */}
			<section className="detect-section">
				<h2>The Composite Picture</h2>
				{summary ? (
					<>
						{(avatarSvg || personaGuess) && (
							<div className="fingerprint-avatar-block">
								{avatarSvg ? (
									<div
										className="fingerprint-avatar-svg"
										// biome-ignore lint/security/noDangerouslySetInnerHtml: SVG from server-side Anthropic path + Rust sanitizer only
										dangerouslySetInnerHTML={{ __html: avatarSvg }}
										role="img"
										aria-label="Speculative fictional avatar derived from your fingerprint hash (not a real photo)"
									/>
								) : null}
								{personaGuess ? (
									<p className="summary-paragraph fingerprint-avatar-guess">
										<strong>Wild guess:</strong> {personaGuess}
									</p>
								) : null}
							</div>
						)}
						<p
							className="summary-paragraph"
							// biome-ignore lint/security/noDangerouslySetInnerHtml: summary built from esc()escaped profile fields only
							dangerouslySetInnerHTML={{ __html: summary }}
						/>
						{llmSummary && (
							<p className="summary-paragraph" style={{ marginTop: "1rem" }}>
								<strong>From your browsing:</strong> {llmSummary}
							</p>
						)}
					</>
				) : (
					<p className="summary-paragraph">Building your profile&hellip;</p>
				)}
			</section>
		</>
	);
}
