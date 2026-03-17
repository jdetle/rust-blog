"use client";

import { useEffect, useState, useCallback } from "react";
import { ANALYTICS_API_URL } from "@/lib/config";
import type { VpnAssessment, VpnSignal, ClientSignals, EdgeSignals } from "@/lib/vpn-detect";
import { analyzeClientServerMismatch, computeVerdict } from "@/lib/vpn-detect";

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
      <dd className={`detect-val ${!value ? "loading-pulse" : "detect-reveal"}`}>
        {value ?? "\u2026"}
      </dd>
    </div>
  );
}

function ConfidenceMeter({ value, verdict }: { value: number; verdict: string }) {
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

function VerdictBadge({ verdict }: { verdict: string }) {
  const labels: Record<string, string> = {
    residential: "Residential IP",
    "likely-vpn": "Likely VPN",
    datacenter: "Datacenter IP",
    tor: "Tor Network",
    proxy: "Possible Proxy",
    unknown: "Unknown",
  };
  return <span className={`verdict-badge verdict-${verdict}`}>{labels[verdict] ?? verdict}</span>;
}

function SignalRow({ signal }: { signal: VpnSignal }) {
  return (
    <div className={`signal-row ${signal.detected ? "signal-triggered" : "signal-clear"}`}>
      <span className="signal-indicator">{signal.detected ? "\u26a0" : "\u2713"}</span>
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
  if (ua.includes("Firefox/")) return "Firefox " + ua.split("Firefox/")[1].split(" ")[0];
  if (ua.includes("Edg/")) return "Edge " + ua.split("Edg/")[1].split(" ")[0];
  if (ua.includes("OPR/")) return "Opera " + ua.split("OPR/")[1].split(" ")[0];
  if (ua.includes("Chrome/")) return "Chrome " + ua.split("Chrome/")[1].split(" ")[0];
  if (ua.includes("Safari/") && ua.includes("Version/")) return "Safari " + ua.split("Version/")[1].split(" ")[0];
  return ua;
}

function parseOS(ua: string): string {
  if (ua.includes("Windows NT 10")) return "Windows 10/11";
  if (ua.includes("Windows NT")) return "Windows";
  if (ua.includes("Mac OS X")) {
    const ver = ua.match(/Mac OS X (\d+[_.\d]+)/);
    return "macOS " + (ver ? ver[1].replace(/_/g, ".") : "");
  }
  if (ua.includes("Android")) { const v = ua.match(/Android ([\d.]+)/); return "Android " + (v ? v[1] : ""); }
  if (ua.includes("iPhone OS") || ua.includes("iPad")) { const iv = ua.match(/OS (\d+[_\d]+)/); return "iOS " + (iv ? iv[1].replace(/_/g, ".") : ""); }
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
    if (!gl || !(gl instanceof WebGLRenderingContext)) return "WebGL unavailable";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return "GPU info restricted";
    return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;
  } catch { return "unavailable"; }
}

function canvasFingerprint(): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 280;
    canvas.height = 40;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "Canvas blocked";
    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("jdetle.com \u{1F31F} fingerprint", 2, 15);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText("jdetle.com \u{1F31F} fingerprint", 4, 17);
    const data = canvas.toDataURL();
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = (hash << 5) - hash + data.charCodeAt(i);
      hash = hash & hash;
    }
    let hex = (hash >>> 0).toString(16);
    while (hex.length < 8) hex = "0" + hex;
    return hex;
  } catch { return "Canvas blocked"; }
}

async function detectWebRTCIPs(): Promise<string[]> {
  return new Promise((resolve) => {
    const ips: string[] = [];
    try {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      pc.createDataChannel("");
      pc.createOffer().then((offer) => pc.setLocalDescription(offer)).catch(() => resolve([]));

      const timeout = setTimeout(() => { pc.close(); resolve(ips); }, 3000);

      pc.onicecandidate = (e) => {
        if (!e.candidate) { clearTimeout(timeout); pc.close(); resolve(ips); return; }
        const match = e.candidate.candidate.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
        if (match && !ips.includes(match[1])) ips.push(match[1]);
      };
    } catch { resolve([]); }
  });
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function classifyReferrer(url: string): string {
  if (!url) return "direct";
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("google.") || host.includes("bing.com") || host.includes("duckduckgo.com")) return "search";
    if (host.includes("twitter.com") || host.includes("x.com") || host.includes("t.co")) return "social:twitter";
    if (host.includes("linkedin.com")) return "social:linkedin";
    if (host.includes("reddit.com")) return "social:reddit";
    if (host.includes("news.ycombinator.com")) return "social:hackernews";
    if (host.includes("github.com")) return "social:github";
    if (host.includes("facebook.com")) return "social:facebook";
    return "other:" + host;
  } catch { return "other"; }
}

function humanizeClass(cls: string): string {
  const map: Record<string, string> = {
    direct: "Direct visit", search: "Search engine",
    "social:twitter": "Twitter / X", "social:linkedin": "LinkedIn",
    "social:reddit": "Reddit", "social:hackernews": "Hacker News",
    "social:github": "GitHub", "social:facebook": "Facebook",
  };
  if (map[cls]) return map[cls];
  if (cls.startsWith("other:")) return "External (" + cls.split(":")[1] + ")";
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
  const [capabilities, setCapabilities] = useState<Record<string, string | null>>({});
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [referral, setReferral] = useState<Record<string, string | null>>({});
  const [analyticsTools, setAnalyticsTools] = useState<{ name: string; active: boolean }[]>([]);
  const [vpnAssessment, setVpnAssessment] = useState<VpnAssessment | null>(null);
  const [edgeDetail, setEdgeDetail] = useState<Record<string, string | null>>({});
  const [summary, setSummary] = useState<string | null>(null);
  const [signalCount, setSignalCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [userEvents, setUserEvents] = useState<
    { event_id: string; event_type: string; source: string; page_url: string; event_date: string }[]
  >([]);
  const [userEventsLoading, setUserEventsLoading] = useState(false);
  const [userEventsError, setUserEventsError] = useState<string | null>(null);

  const detectAll = useCallback(async () => {
    const profile: DetectedProfile = {};
    let signals = 0;
    const track = (key: string, val: string | null | undefined) => {
      if (val) { profile[key] = val; signals++; }
    };

    // ── 1. Fetch edge intelligence API ─────────────────────────────
    let edgeApi: EdgeApiResponse | null = null;
    try {
      const res = await fetch("/api/edge-detect");
      if (res.ok) edgeApi = (await res.json()) as EdgeApiResponse;
    } catch { /* edge API unavailable */ }

    // ── 2. Network (combine Vercel headers + edge API) ─────────────
    const geoSource = edgeApi?.edge ?? serverGeo;
    const ip = geoSource.ip ? maskIP(geoSource.ip) : "hidden";
    const net: Record<string, string | null> = {
      ip,
      city: geoSource.city ?? null,
      region: geoSource.region ?? null,
      country: edgeApi?.ipapi?.countryName as string ?? geoSource.country ?? null,
      isp: edgeApi?.edge.org ?? "Detected server-side",
      org: edgeApi?.edge.org ?? "Detected server-side",
      timezone_ip: geoSource.timezone ?? null,
      asn: edgeApi?.edge.asn ?? null,
      network: edgeApi?.ipapi?.network as string ?? null,
    };
    setNetwork(net);
    for (const [k, v] of Object.entries(net)) track(k, v);

    // Edge metadata
    const pop = edgeApi?.edge.pop ?? edgeInfo.pop;
    const provider = edgeApi?.edge.provider ?? (edgeInfo.pop ? "vercel-edge" : "local");
    setEdgeDetail({
      pop: pop ?? "local",
      provider,
      timestamp: edgeInfo.timestamp
        ? new Date(Number(edgeInfo.timestamp)).toISOString()
        : new Date().toISOString(),
      currency: edgeApi?.ipapi?.currency as string ?? null,
      postalCode: edgeApi?.ipapi?.postalCode as string ?? null,
      callingCode: edgeApi?.ipapi?.countryCallingCode as string ?? null,
      isEU: edgeApi?.edge.isEU ? "Yes" : "No",
    });

    // ── 3. Device ──────────────────────────────────────────────────
    const ua = navigator.userAgent;
    const dev = {
      browser: parseBrowser(ua),
      os: parseOS(ua),
      deviceType: guessDeviceType(),
      cores: navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} cores` : "unavailable",
      ram: "deviceMemory" in navigator ? `${(navigator as { deviceMemory: number }).deviceMemory} GB` : "unavailable",
      screen: `${screen.width} \u00d7 ${screen.height}`,
      viewport: `${window.innerWidth} \u00d7 ${window.innerHeight}`,
      dpr: `${window.devicePixelRatio}x${window.devicePixelRatio > 1 ? " (retina)" : ""}`,
      colorDepth: `${screen.colorDepth}-bit`,
      touch: navigator.maxTouchPoints > 0 ? `Yes (${navigator.maxTouchPoints} touch points)` : "No",
      gpu: getGPU(),
    };
    setDevice(dev);
    for (const [k, v] of Object.entries(dev)) track(k, v);

    // ── 4. Capabilities ────────────────────────────────────────────
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const languages = (navigator.languages || [navigator.language]).join(", ");
    const dnt = navigator.doNotTrack === "1" ? "Enabled" : navigator.doNotTrack === "0" ? "Disabled" : "Not set";
    const conn = (navigator as { connection?: { effectiveType?: string; downlink?: number; rtt?: number } }).connection;
    let connectionStr = "API unavailable";
    let connectionRtt: number | null = null;
    if (conn) {
      connectionStr = conn.effectiveType ?? "unknown";
      if (conn.downlink) connectionStr += `, ${conn.downlink} Mbps`;
      if (conn.rtt) { connectionStr += `, ${conn.rtt}ms RTT`; connectionRtt = conn.rtt; }
    }

    const caps: Record<string, string | null> = {
      timezone: tz,
      languages,
      dnt,
      cookies: navigator.cookieEnabled ? "Yes" : "No",
      darkMode: window.matchMedia("(prefers-color-scheme: dark)").matches ? "Preferred" : "Not preferred",
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "Reduce requested" : "No preference",
      connection: connectionStr,
      battery: null,
      webgl: (() => { try { const c = document.createElement("canvas"); return (c.getContext("webgl") || c.getContext("experimental-webgl")) ? "Supported" : "Not supported"; } catch { return "Not supported"; } })(),
      wasm: typeof WebAssembly === "object" ? "Supported" : "Not supported",
      sw: "serviceWorker" in navigator ? "Supported" : "Not supported",
    };
    setCapabilities(caps);
    for (const [k, v] of Object.entries(caps)) track(k, v);

    // Battery (async, non-blocking)
    if ("getBattery" in navigator) {
      (navigator as { getBattery: () => Promise<{ level: number; charging: boolean }> }).getBattery()
        .then((b) => { setCapabilities((prev) => ({ ...prev, battery: `${Math.round(b.level * 100)}%${b.charging ? " (charging)" : " (discharging)"}` })); })
        .catch(() => { setCapabilities((prev) => ({ ...prev, battery: "denied" })); });
    } else {
      setCapabilities((prev) => ({ ...prev, battery: "API unavailable" }));
    }

    // ── 5. Fingerprint ─────────────────────────────────────────────
    const fp = canvasFingerprint();
    setFingerprint(fp);
    track("fingerprint", fp);

    // ── 6. Referral ────────────────────────────────────────────────
    const ref = document.referrer || sessionStorage.getItem("_referrer") || "";
    const refClass = classifyReferrer(ref);
    const params = new URLSearchParams(window.location.search);
    const utmObj: Record<string, string> = {};
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
      const v = params.get(k); if (v) utmObj[k] = v;
    }
    if (!Object.keys(utmObj).length) {
      const utmRaw = sessionStorage.getItem("_utm");
      if (utmRaw) try { Object.assign(utmObj, JSON.parse(utmRaw)); } catch { /* empty */ }
    }
    setReferral({
      referrer: ref || "Direct (no referrer)",
      referrerType: humanizeClass(refClass),
      utm: Object.keys(utmObj).length
        ? Object.entries(utmObj).map(([k, v]) => `${k.replace("utm_", "")}: ${v}`).join(" \u00b7 ")
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
      browserLanguages: navigator.languages ? [...navigator.languages] : [navigator.language],
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
    const clientServerSignals = analyzeClientServerMismatch(edgeSignalsForVpn, clientSignals);
    const allSignals = [...serverSignals, ...clientServerSignals];
    const assessment = computeVerdict(allSignals);
    setVpnAssessment(assessment);

    // ── 8. Analytics tools (delayed) ───────────────────────────────
    setTimeout(() => {
      setAnalyticsTools([
        { name: "Google Analytics 4", active: !!window.gtag || !!(window as { dataLayer?: unknown }).dataLayer },
        { name: "Microsoft Clarity", active: !!(window as { clarity?: unknown }).clarity },
        { name: "Plausible", active: !!(window as { plausible?: unknown }).plausible },
        { name: "PostHog", active: !!(window as { posthog?: { capture?: unknown } }).posthog && typeof (window as { posthog?: { capture?: unknown } }).posthog?.capture === "function" },
        { name: "Vercel Analytics", active: !!document.querySelector('script[src*="_vercel/insights"]') },
      ]);
    }, 1500);

    setSignalCount(signals);

    // ── 9. Summary ─────────────────────────────────────────────────
    setTimeout(() => {
      const parts: string[] = [];
      if (profile.city && profile.country) parts.push(`You appear to be in <strong>${esc(profile.city)}, ${esc(profile.country)}</strong>.`);
      if (profile.browser && profile.os) {
        let s = `You're using <strong>${esc(profile.browser)}</strong> on <strong>${esc(profile.os)}</strong>`;
        if (profile.deviceType) s += ` (${esc(profile.deviceType).toLowerCase()})`;
        parts.push(s + ".");
      }
      if (profile.gpu && profile.gpu !== "unavailable" && profile.gpu !== "GPU info restricted") {
        let s = `Your GPU is a <strong>${esc(profile.gpu)}</strong>`;
        if (profile.cores) s += ` paired with ${esc(profile.cores)}`;
        if (profile.ram) s += ` and ${esc(profile.ram)} of memory`;
        parts.push(s + ".");
      }
      if (profile.screen) {
        let s = `Your screen is <strong>${esc(profile.screen)}</strong>`;
        if (profile.dpr) s += ` at ${esc(profile.dpr)} density`;
        parts.push(s + ".");
      }
      if (profile.timezone) {
        let s = `Your clock says it's <strong>${esc(profile.timezone)}</strong>`;
        if (profile.languages) s += ` and you prefer <strong>${esc(profile.languages.split(",")[0].trim())}</strong>`;
        parts.push(s + ".");
      }
      if (profile.darkMode === "Preferred") parts.push("You prefer <strong>dark mode</strong>.");
      if (profile.adblock === "Detected") parts.push("You're running an <strong>ad blocker</strong> &mdash; wise choice.");
      if (profile.dnt === "Enabled") parts.push("You've enabled <strong>Do Not Track</strong>.");
      if (profile.fingerprint) parts.push(`Your canvas fingerprint is <code>${esc(profile.fingerprint)}</code> &mdash; a nearly unique identifier derived from how your browser renders graphics.`);

      // Add VPN verdict to summary
      if (assessment.verdict === "residential") {
        parts.push("Your connection appears to come from a <strong>standard residential IP</strong> &mdash; no VPN or proxy detected.");
      } else if (assessment.verdict === "likely-vpn") {
        parts.push("Your connection shows <strong>strong indicators of VPN usage</strong>.");
      } else if (assessment.verdict === "tor") {
        parts.push("You appear to be using the <strong>Tor anonymity network</strong>.");
      } else if (assessment.verdict === "datacenter") {
        parts.push("Your IP belongs to a <strong>datacenter</strong>, not a residential ISP.");
      } else if (assessment.verdict === "proxy") {
        parts.push("Some signals suggest your traffic may be passing through a <strong>proxy</strong>.");
      }

      setSummary(parts.join(" ") || "Could not gather enough data to build a profile.");
      setLoaded(true);
    }, 2500);
  }, [serverGeo, edgeInfo]);

  useEffect(() => { detectAll(); }, [detectAll]);

  useEffect(() => {
    if (!loaded || !ANALYTICS_API_URL) return;
    const posthog = (window as { posthog?: { get_distinct_id?: () => string } }).posthog;
    const distinctId = posthog?.get_distinct_id?.();
    if (!distinctId) return;

    setUserEventsLoading(true);
    setUserEventsError(null);
    const url = new URL("/user-events", ANALYTICS_API_URL);
    url.searchParams.set("user_id", distinctId);
    url.searchParams.set("limit", "50");
    fetch(url.href)
      .then((r) => {
        if (!r.ok) throw new Error(`API returned ${r.status}`);
        return r.json();
      })
      .then((data: { events?: { event_id: string; event_type: string; source: string; page_url: string; event_date: string }[] }) => {
        setUserEvents(data.events ?? []);
      })
      .catch((e) => setUserEventsError(e instanceof Error ? e.message : "Failed to load events"))
      .finally(() => setUserEventsLoading(false));
  }, [loaded]);

  return (
    <>
      <div className={`profile-status ${loaded ? "profile-hidden" : ""}`}>Gathering data&hellip;</div>
      <div className={`profile-status ${loaded ? "" : "profile-hidden"}`}>Analysis complete. {signalCount} signals detected.</div>

      {/* ── Origin Intelligence ────────────────────────────────────── */}
      <section className="detect-section origin-intel">
        <h2>Origin Intelligence</h2>
        <p className="detect-note">
          Server-side analysis from the edge node closest to you
        </p>

        {vpnAssessment && (
          <div className="vpn-verdict-card">
            <div className="verdict-header">
              <VerdictBadge verdict={vpnAssessment.verdict} />
              <ConfidenceMeter value={vpnAssessment.confidence} verdict={vpnAssessment.verdict} />
            </div>
            <p className="verdict-summary">{vpnAssessment.summary}</p>
          </div>
        )}

        <dl className="detect-grid">
          <DetectRow id="edge-pop" label="Edge node (POP)" value={edgeDetail.pop ?? null} />
          <DetectRow id="edge-provider" label="Edge provider" value={edgeDetail.provider ?? null} />
          <DetectRow id="edge-time" label="Edge timestamp" value={edgeDetail.timestamp ?? null} />
          <DetectRow id="asn" label="ASN" value={network.asn ?? null} />
          <DetectRow id="org" label="Network organization" value={network.org ?? null} />
          <DetectRow id="network-range" label="Network range" value={network.network ?? null} />
          <DetectRow id="postal" label="Postal code" value={edgeDetail.postalCode ?? null} />
          <DetectRow id="currency" label="Local currency" value={edgeDetail.currency ?? null} />
          <DetectRow id="calling-code" label="Country calling code" value={edgeDetail.callingCode ?? null} />
          <DetectRow id="eu-member" label="EU member state" value={edgeDetail.isEU ?? null} />
        </dl>

        {vpnAssessment && vpnAssessment.signals.length > 0 && (
          <div className="signal-breakdown">
            <h3>Signal Breakdown</h3>
            <p className="detect-note">
              Each signal contributes a weighted score. Triggered signals increase the obfuscation confidence.
            </p>
            {vpnAssessment.signals.map((s) => (
              <SignalRow key={s.name} signal={s} />
            ))}
          </div>
        )}
      </section>

      {/* ── Network & Location ────────────────────────────────────── */}
      <section className="detect-section">
        <h2>Network &amp; Location</h2>
        <p className="detect-note">
          {serverGeo.city ? "Via Vercel Edge geo headers (server-side)" : "Via IP geolocation lookup"}
        </p>
        <dl className="detect-grid">
          <DetectRow id="ip" label="IP address" value={network.ip ?? null} />
          <DetectRow id="city" label="City" value={network.city ?? null} />
          <DetectRow id="region" label="Region" value={network.region ?? null} />
          <DetectRow id="country" label="Country" value={network.country ?? null} />
          <DetectRow id="isp" label="ISP" value={network.isp ?? null} />
          <DetectRow id="timezone-ip" label="Timezone (IP)" value={network.timezone_ip ?? null} />
        </dl>
      </section>

      {/* ── Device & Hardware ─────────────────────────────────────── */}
      <section className="detect-section">
        <h2>Device &amp; Hardware</h2>
        <p className="detect-note">From Navigator and Screen APIs</p>
        <dl className="detect-grid">
          <DetectRow id="browser" label="Browser" value={device.browser ?? null} />
          <DetectRow id="os" label="Operating system" value={device.os ?? null} />
          <DetectRow id="device-type" label="Device type" value={device.deviceType ?? null} />
          <DetectRow id="cpu" label="CPU cores" value={device.cores ?? null} />
          <DetectRow id="ram" label="Device memory" value={device.ram ?? null} />
          <DetectRow id="screen-res" label="Screen resolution" value={device.screen ?? null} />
          <DetectRow id="viewport" label="Viewport" value={device.viewport ?? null} />
          <DetectRow id="dpr" label="Pixel ratio (retina)" value={device.dpr ?? null} />
          <DetectRow id="color-depth" label="Color depth" value={device.colorDepth ?? null} />
          <DetectRow id="touch" label="Touch support" value={device.touch ?? null} />
          <DetectRow id="gpu" label="GPU" value={device.gpu ?? null} />
        </dl>
      </section>

      {/* ── Browser Capabilities ──────────────────────────────────── */}
      <section className="detect-section">
        <h2>Browser Capabilities</h2>
        <p className="detect-note">Feature detection and preference queries</p>
        <dl className="detect-grid">
          <DetectRow id="timezone" label="Timezone" value={capabilities.timezone ?? null} />
          <DetectRow id="languages" label="Languages" value={capabilities.languages ?? null} />
          <DetectRow id="dnt" label="Do Not Track" value={capabilities.dnt ?? null} />
          <DetectRow id="cookies" label="Cookies enabled" value={capabilities.cookies ?? null} />
          <DetectRow id="darkmode" label="Dark mode" value={capabilities.darkMode ?? null} />
          <DetectRow id="reducedmotion" label="Reduced motion" value={capabilities.reducedMotion ?? null} />
          <DetectRow id="connection" label="Connection" value={capabilities.connection ?? null} />
          <DetectRow id="battery" label="Battery" value={capabilities.battery ?? null} />
          <DetectRow id="webgl" label="WebGL" value={capabilities.webgl ?? null} />
          <DetectRow id="wasm" label="WebAssembly" value={capabilities.wasm ?? null} />
          <DetectRow id="sw" label="Service Workers" value={capabilities.sw ?? null} />
        </dl>
      </section>

      {/* ── Canvas Fingerprint ────────────────────────────────────── */}
      <section className="detect-section">
        <h2>Canvas Fingerprint</h2>
        <p className="detect-note">A hash derived from how your browser renders graphics &mdash; nearly unique to your device</p>
        <dl className="detect-grid">
          <DetectRow id="canvas-hash" label="Fingerprint hash" value={fingerprint} />
        </dl>
      </section>

      {/* ── How You Got Here ──────────────────────────────────────── */}
      <section className="detect-section">
        <h2>How You Got Here</h2>
        <p className="detect-note">Referrer header and URL parameters</p>
        <dl className="detect-grid">
          <DetectRow id="referrer" label="Referrer" value={referral.referrer ?? null} />
          <DetectRow id="ref-class" label="Referrer type" value={referral.referrerType ?? null} />
          <DetectRow id="utm" label="UTM tags" value={referral.utm ?? null} />
        </dl>
      </section>

      {/* ── Analytics Tools ───────────────────────────────────────── */}
      <section className="detect-section">
        <h2>Analytics Tools Watching You</h2>
        <p className="detect-note">Scripts currently loaded on this page</p>
        <ul className="analytics-list">
          {analyticsTools.map((t) => (
            <li key={t.name} className="analytics-item">
              <span className={`analytics-dot ${t.active ? "dot-active" : "dot-inactive"}`} />
              <span>{t.name}</span>
              <span className="analytics-status">{t.active ? "Active" : "Not loaded"}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Your Event History ─────────────────────────────────────── */}
      {ANALYTICS_API_URL && (
        <section className="detect-section">
          <h2>Your Event History</h2>
          <p className="detect-note">
            Events associated with your PostHog distinct_id, pulled from the analytics warehouse.
          </p>
          {userEventsLoading && <p className="detect-note">Loading&hellip;</p>}
          {userEventsError && (
            <p className="detect-note" style={{ color: "var(--error, #dc2626)" }}>
              {userEventsError}
            </p>
          )}
          {!userEventsLoading && !userEventsError && userEvents.length === 0 && (
            <p className="detect-note">No events found yet. Visit a few pages and check back.</p>
          )}
          {!userEventsLoading && !userEventsError && userEvents.length > 0 && (
            <ul className="post-list" style={{ marginTop: "0.5rem" }}>
              {userEvents.map((e) => (
                <li key={e.event_id}>
                  <div>
                    <span className="post-title">{e.event_type}</span>
                    <span className="post-kicker">
                      {e.source} &middot; {e.event_date}
                      {e.page_url ? ` &middot; ${e.page_url}` : ""}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── Composite Summary ─────────────────────────────────────── */}
      <section className="detect-section">
        <h2>The Composite Picture</h2>
        {summary ? (
          <p className="summary-paragraph" dangerouslySetInnerHTML={{ __html: summary }} />
        ) : (
          <p className="summary-paragraph">Building your profile&hellip;</p>
        )}
      </section>
    </>
  );
}
