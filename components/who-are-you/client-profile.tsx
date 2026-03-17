"use client";

import { useEffect, useState, useCallback } from "react";

interface ServerGeo {
  ip: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  latitude: string | null;
  longitude: string | null;
  timezone: string | null;
}

interface DetectedProfile {
  [key: string]: string | undefined;
}

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
    <div className={`detect-row`} id={`row-${id}`}>
      <dt>{label}</dt>
      <dd
        className={`detect-val ${!value ? "loading-pulse" : "detect-reveal"}`}
      >
        {value ?? "\u2026"}
      </dd>
    </div>
  );
}

function maskIP(ip: string): string {
  if (!ip) return "unavailable";
  const parts = ip.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
  return ip.replace(/:[\da-f]+$/i, ":xxxx");
}

function parseBrowser(ua: string): string {
  if (ua.includes("Firefox/"))
    return "Firefox " + ua.split("Firefox/")[1].split(" ")[0];
  if (ua.includes("Edg/"))
    return "Edge " + ua.split("Edg/")[1].split(" ")[0];
  if (ua.includes("OPR/"))
    return "Opera " + ua.split("OPR/")[1].split(" ")[0];
  if (ua.includes("Chrome/"))
    return "Chrome " + ua.split("Chrome/")[1].split(" ")[0];
  if (ua.includes("Safari/") && ua.includes("Version/"))
    return "Safari " + ua.split("Version/")[1].split(" ")[0];
  return ua;
}

function parseOS(ua: string): string {
  if (ua.includes("Windows NT 10")) return "Windows 10/11";
  if (ua.includes("Windows NT")) return "Windows";
  if (ua.includes("Mac OS X")) {
    const ver = ua.match(/Mac OS X (\d+[_.\d]+)/);
    return "macOS " + (ver ? ver[1].replace(/_/g, ".") : "");
  }
  if (ua.includes("Android")) {
    const v = ua.match(/Android ([\d.]+)/);
    return "Android " + (v ? v[1] : "");
  }
  if (ua.includes("iPhone OS") || ua.includes("iPad")) {
    const iv = ua.match(/OS (\d+[_\d]+)/);
    return "iOS " + (iv ? iv[1].replace(/_/g, ".") : "");
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
    if (!gl || !(gl instanceof WebGLRenderingContext)) return "WebGL unavailable";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return "GPU info restricted";
    return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;
  } catch {
    return "unavailable";
  }
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
  } catch {
    return "Canvas blocked";
  }
}

export function ClientProfile({ serverGeo }: { serverGeo: ServerGeo }) {
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
  const [summary, setSummary] = useState<string | null>(null);
  const [signalCount, setSignalCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const detectAll = useCallback(() => {
    const profile: DetectedProfile = {};
    let signals = 0;

    const track = (key: string, val: string | null | undefined) => {
      if (val) {
        profile[key] = val;
        signals++;
      }
    };

    // Network -- prefer Vercel geo headers, fall back to client-side API
    if (serverGeo.city) {
      const ip = serverGeo.ip ? maskIP(serverGeo.ip) : "hidden by server";
      const net: Record<string, string | null> = {
        ip,
        city: serverGeo.city,
        region: serverGeo.region,
        country: serverGeo.country,
        isp: "Detected server-side via Vercel",
        org: "Detected server-side via Vercel",
        timezone_ip: serverGeo.timezone,
      };
      setNetwork(net);
      for (const [k, v] of Object.entries(net)) track(k, v);
    } else {
      fetch("https://ipapi.co/json/")
        .then((r) => r.json())
        .then(
          (d: {
            ip?: string;
            city?: string;
            region?: string;
            country_name?: string;
            country_code?: string;
            org?: string;
            asn?: string;
            timezone?: string;
          }) => {
            const net: Record<string, string | null> = {
              ip: maskIP(d.ip ?? ""),
              city: d.city ?? null,
              region: d.region ?? null,
              country: d.country_name
                ? `${d.country_name} (${d.country_code})`
                : null,
              isp: d.org ?? d.asn ?? null,
              org: d.org ?? "same as ISP",
              timezone_ip: d.timezone ?? null,
            };
            setNetwork(net);
          },
        )
        .catch(() => {
          setNetwork({
            ip: "blocked",
            city: "unavailable",
            region: "unavailable",
            country: "unavailable",
            isp: "unavailable",
            org: "unavailable",
            timezone_ip: "unavailable",
          });
        });
    }

    // Device
    const ua = navigator.userAgent;
    const browser = parseBrowser(ua);
    const os = parseOS(ua);
    const deviceType = guessDeviceType();
    const cores = navigator.hardwareConcurrency
      ? `${navigator.hardwareConcurrency} cores`
      : "unavailable";
    const ram =
      "deviceMemory" in navigator
        ? `${(navigator as { deviceMemory: number }).deviceMemory} GB`
        : "unavailable";
    const screenRes = `${screen.width} \u00d7 ${screen.height}`;
    const viewport = `${window.innerWidth} \u00d7 ${window.innerHeight}`;
    const dpr = `${window.devicePixelRatio}x${window.devicePixelRatio > 1 ? " (retina)" : ""}`;
    const colorDepth = `${screen.colorDepth}-bit`;
    const touch = navigator.maxTouchPoints > 0
      ? `Yes (${navigator.maxTouchPoints} touch points)`
      : "No";
    const gpu = getGPU();

    const dev = {
      browser,
      os,
      deviceType,
      cores,
      ram,
      screen: screenRes,
      viewport,
      dpr,
      colorDepth,
      touch,
      gpu,
    };
    setDevice(dev);
    for (const [k, v] of Object.entries(dev)) track(k, v);

    // Capabilities
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const languages = (navigator.languages || [navigator.language]).join(", ");
    const dnt =
      navigator.doNotTrack === "1"
        ? "Enabled"
        : navigator.doNotTrack === "0"
          ? "Disabled"
          : "Not set";
    const cookies = navigator.cookieEnabled ? "Yes" : "No";
    const darkMode = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "Preferred"
      : "Not preferred";
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches
      ? "Reduce requested"
      : "No preference";

    const conn = (navigator as { connection?: { effectiveType?: string; downlink?: number; rtt?: number } }).connection;
    let connectionStr = "API unavailable";
    if (conn) {
      connectionStr = conn.effectiveType ?? "unknown";
      if (conn.downlink) connectionStr += `, ${conn.downlink} Mbps`;
      if (conn.rtt) connectionStr += `, ${conn.rtt}ms RTT`;
    }

    const webgl = (() => {
      try {
        const c = document.createElement("canvas");
        return c.getContext("webgl") || c.getContext("experimental-webgl")
          ? "Supported"
          : "Not supported";
      } catch {
        return "Not supported";
      }
    })();
    const wasm =
      typeof WebAssembly === "object" ? "Supported" : "Not supported";
    const sw =
      "serviceWorker" in navigator ? "Supported" : "Not supported";

    const caps: Record<string, string | null> = {
      timezone: tz,
      languages,
      dnt,
      cookies,
      darkMode,
      reducedMotion,
      connection: connectionStr,
      battery: null,
      webgl,
      wasm,
      sw,
    };
    setCapabilities(caps);
    for (const [k, v] of Object.entries(caps)) track(k, v);

    // Battery (async)
    if ("getBattery" in navigator) {
      (navigator as { getBattery: () => Promise<{ level: number; charging: boolean }> })
        .getBattery()
        .then((b) => {
          const pct = Math.round(b.level * 100) + "%";
          const charging = b.charging ? " (charging)" : " (discharging)";
          setCapabilities((prev) => ({ ...prev, battery: pct + charging }));
        })
        .catch(() => {
          setCapabilities((prev) => ({ ...prev, battery: "denied" }));
        });
    } else {
      setCapabilities((prev) => ({ ...prev, battery: "API unavailable" }));
    }

    // Fingerprint
    const fp = canvasFingerprint();
    setFingerprint(fp);
    track("fingerprint", fp);

    // Referral
    const ref =
      document.referrer || sessionStorage.getItem("_referrer") || "";
    const refClass = classifyReferrer(ref);
    const utmRaw = sessionStorage.getItem("_utm");
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
    if (!Object.keys(utmObj).length && utmRaw) {
      try {
        Object.assign(utmObj, JSON.parse(utmRaw));
      } catch {
        /* empty */
      }
    }
    let utmStr = "None";
    if (Object.keys(utmObj).length) {
      utmStr = Object.entries(utmObj)
        .map(([k, v]) => `${k.replace("utm_", "")}: ${v}`)
        .join(" \u00b7 ");
    }
    setReferral({
      referrer: ref || "Direct (no referrer)",
      referrerType: humanizeClass(refClass),
      utm: utmStr,
    });
    track("referrer", ref || "direct");

    // Analytics tools (check after delay)
    setTimeout(() => {
      const tools = [
        {
          name: "Google Analytics 4",
          active: !!window.gtag || !!(window as { dataLayer?: unknown }).dataLayer,
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
          active:
            !!(window as { posthog?: { capture?: unknown } }).posthog &&
            typeof (window as { posthog?: { capture?: unknown } }).posthog
              ?.capture === "function",
        },
        {
          name: "Vercel Analytics",
          active: !!document.querySelector(
            'script[src*="_vercel/insights"]',
          ),
        },
      ];
      setAnalyticsTools(tools);
    }, 1500);

    setSignalCount(signals);

    // Build summary after everything settles
    setTimeout(() => {
      const parts: string[] = [];
      if (profile.city && profile.country) {
        parts.push(
          `You appear to be in <strong>${escape(profile.city)}, ${escape(profile.country)}</strong>`,
        );
      }
      if (profile.isp && parts.length)
        parts[parts.length - 1] += ` on <strong>${escape(profile.isp)}</strong>`;
      if (parts.length) parts[parts.length - 1] += ".";

      if (profile.browser && profile.os) {
        let s = `You're using <strong>${escape(profile.browser)}</strong> on <strong>${escape(profile.os)}</strong>`;
        if (profile.deviceType) s += ` (${escape(profile.deviceType).toLowerCase()})`;
        parts.push(s + ".");
      }

      if (
        profile.gpu &&
        profile.gpu !== "unavailable" &&
        profile.gpu !== "GPU info restricted"
      ) {
        let s = `Your GPU is a <strong>${escape(profile.gpu)}</strong>`;
        if (profile.cores) s += ` paired with ${escape(profile.cores)}`;
        if (profile.ram) s += ` and ${escape(profile.ram)} of memory`;
        parts.push(s + ".");
      }

      if (profile.screen) {
        let s = `Your screen is <strong>${escape(profile.screen)}</strong>`;
        if (profile.dpr) s += ` at ${escape(profile.dpr)} density`;
        parts.push(s + ".");
      }

      if (profile.timezone) {
        let s = `Your clock says it's <strong>${escape(profile.timezone)}</strong>`;
        if (profile.languages)
          s += ` and you prefer <strong>${escape(profile.languages.split(",")[0].trim())}</strong>`;
        parts.push(s + ".");
      }

      if (profile.darkMode === "Preferred")
        parts.push("You prefer <strong>dark mode</strong>.");
      if (profile.adblock === "Detected")
        parts.push(
          "You're running an <strong>ad blocker</strong> &mdash; wise choice.",
        );
      if (profile.dnt === "Enabled")
        parts.push("You've enabled <strong>Do Not Track</strong>.");

      if (profile.fingerprint) {
        parts.push(
          `Your canvas fingerprint is <code>${escape(profile.fingerprint)}</code> &mdash; a nearly unique identifier derived from how your browser renders graphics.`,
        );
      }

      setSummary(
        parts.join(" ") ||
          "Could not gather enough data to build a profile.",
      );
      setLoaded(true);
    }, 2500);
  }, [serverGeo]);

  useEffect(() => {
    detectAll();
  }, [detectAll]);

  return (
    <>
      <div className={`profile-status ${loaded ? "profile-hidden" : ""}`}>
        Gathering data&hellip;
      </div>
      <div className={`profile-status ${loaded ? "" : "profile-hidden"}`}>
        Analysis complete. {signalCount} signals detected.
      </div>

      {/* Network & Location */}
      <section className="detect-section">
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
            id="org"
            label="Organization"
            value={network.org ?? null}
          />
          <DetectRow
            id="timezone-ip"
            label="Timezone (IP)"
            value={network.timezone_ip ?? null}
          />
        </dl>
      </section>

      {/* Device & Hardware */}
      <section className="detect-section">
        <h2>Device &amp; Hardware</h2>
        <p className="detect-note">From Navigator and Screen APIs</p>
        <dl className="detect-grid">
          <DetectRow
            id="browser"
            label="Browser"
            value={device.browser ?? null}
          />
          <DetectRow id="os" label="Operating system" value={device.os ?? null} />
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
            id="screen"
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

      {/* Browser Capabilities */}
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

      {/* Canvas Fingerprint */}
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

      {/* How You Got Here */}
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

      {/* Analytics Tools */}
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
      </section>

      {/* Composite Summary */}
      <section className="detect-section">
        <h2>The Composite Picture</h2>
        {summary ? (
          <p
            className="summary-paragraph"
            dangerouslySetInnerHTML={{ __html: summary }}
          />
        ) : (
          <p className="summary-paragraph">Building your profile&hellip;</p>
        )}
      </section>
    </>
  );
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
  } catch {
    return "other";
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
  if (cls.startsWith("other:")) return "External (" + cls.split(":")[1] + ")";
  return cls;
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
