/**
 * Multi-signal VPN / proxy / datacenter detection engine.
 *
 * Combines server-side edge intelligence (IP metadata, ASN, CDN edge headers)
 * with client-side browser signals (timezone mismatch, WebRTC leak, locale
 * inconsistency) to produce a probability score and human-readable verdict.
 *
 * This runs heuristics only -- no paid IP reputation API required.
 */

export interface EdgeSignals {
  ip: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  latitude: string | null;
  longitude: string | null;
  timezone: string | null;
  asn: string | null;
  org: string | null;
  isEU: boolean;
}

export interface ClientSignals {
  browserTimezone: string;
  browserLanguages: string[];
  screenWidth: number;
  screenHeight: number;
  devicePixelRatio: number;
  hardwareConcurrency: number;
  maxTouchPoints: number;
  webrtcIPs: string[];
  connectionType: string | null;
  connectionRtt: number | null;
}

export interface VpnAssessment {
  verdict: "residential" | "likely-vpn" | "datacenter" | "tor" | "proxy" | "unknown";
  confidence: number;
  signals: VpnSignal[];
  summary: string;
}

export interface VpnSignal {
  name: string;
  weight: number;
  detected: boolean;
  detail: string;
}

const DATACENTER_ASN_KEYWORDS = [
  "amazon", "aws", "google cloud", "gcp", "microsoft azure", "azure",
  "digitalocean", "linode", "akamai", "vultr", "hetzner", "ovh",
  "oracle cloud", "cloudflare", "fastly", "leaseweb", "choopa",
  "contabo", "scaleway", "upcloud", "kamatera", "cherry servers",
  "hostinger", "ionos", "rackspace",
];

const VPN_PROVIDER_ASN_KEYWORDS = [
  "mullvad", "nordvpn", "expressvpn", "surfshark", "protonvpn",
  "proton ag", "cyberghost", "private internet access", "pia",
  "ipvanish", "windscribe", "tunnelbear", "hotspot shield",
  "hide.me", "ivpn", "astrill", "torguard", "airvpn",
  "perfect privacy", "vyprvpn", "m247",
];

const TOR_EXIT_ASN_KEYWORDS = [
  "tor exit", "tor relay", "tor project",
];

/**
 * Timezone offset table: maps IANA timezone names to their approximate
 * expected country codes. If the browser timezone says America/New_York
 * but the IP geolocates to Germany, that's a strong VPN signal.
 */
const TZ_COUNTRY_MAP: Record<string, string[]> = {
  "America/New_York": ["US", "CA"],
  "America/Chicago": ["US", "CA", "MX"],
  "America/Denver": ["US", "CA", "MX"],
  "America/Los_Angeles": ["US", "CA", "MX"],
  "America/Anchorage": ["US"],
  "Pacific/Honolulu": ["US"],
  "America/Phoenix": ["US"],
  "America/Toronto": ["CA", "US"],
  "America/Vancouver": ["CA", "US"],
  "America/Mexico_City": ["MX"],
  "America/Sao_Paulo": ["BR"],
  "America/Argentina/Buenos_Aires": ["AR"],
  "America/Bogota": ["CO"],
  "America/Lima": ["PE"],
  "America/Santiago": ["CL"],
  "Europe/London": ["GB", "IE", "PT"],
  "Europe/Paris": ["FR", "BE", "LU"],
  "Europe/Berlin": ["DE", "AT", "CH"],
  "Europe/Rome": ["IT", "MT", "VA"],
  "Europe/Madrid": ["ES"],
  "Europe/Amsterdam": ["NL", "BE"],
  "Europe/Zurich": ["CH", "LI"],
  "Europe/Stockholm": ["SE"],
  "Europe/Oslo": ["NO"],
  "Europe/Helsinki": ["FI"],
  "Europe/Warsaw": ["PL"],
  "Europe/Prague": ["CZ", "SK"],
  "Europe/Budapest": ["HU"],
  "Europe/Bucharest": ["RO", "MD"],
  "Europe/Athens": ["GR", "CY"],
  "Europe/Istanbul": ["TR"],
  "Europe/Moscow": ["RU"],
  "Asia/Tokyo": ["JP"],
  "Asia/Seoul": ["KR"],
  "Asia/Shanghai": ["CN"],
  "Asia/Hong_Kong": ["HK", "CN"],
  "Asia/Taipei": ["TW"],
  "Asia/Singapore": ["SG"],
  "Asia/Kolkata": ["IN"],
  "Asia/Dubai": ["AE", "OM"],
  "Asia/Bangkok": ["TH", "VN", "KH", "LA"],
  "Asia/Jakarta": ["ID"],
  "Asia/Manila": ["PH"],
  "Australia/Sydney": ["AU"],
  "Australia/Melbourne": ["AU"],
  "Australia/Perth": ["AU"],
  "Pacific/Auckland": ["NZ"],
  "Africa/Cairo": ["EG"],
  "Africa/Lagos": ["NG"],
  "Africa/Johannesburg": ["ZA"],
  "Africa/Nairobi": ["KE", "TZ", "UG"],
};

function normalizeTimezoneRegion(tz: string): string | null {
  const parts = tz.split("/");
  if (parts.length < 2) return null;
  return parts[0];
}

export function analyzeServerSignals(edge: EdgeSignals): VpnSignal[] {
  const signals: VpnSignal[] = [];
  const orgLower = (edge.org ?? "").toLowerCase();
  const asnLower = (edge.asn ?? "").toLowerCase();
  const combined = orgLower + " " + asnLower;

  const isDatacenter = DATACENTER_ASN_KEYWORDS.some((kw) => combined.includes(kw));
  signals.push({
    name: "Datacenter ASN",
    weight: 35,
    detected: isDatacenter,
    detail: isDatacenter
      ? `IP belongs to a known cloud/datacenter provider (${edge.org})`
      : `ASN "${edge.org || "unknown"}" is not a known datacenter`,
  });

  const isVpnProvider = VPN_PROVIDER_ASN_KEYWORDS.some((kw) => combined.includes(kw));
  signals.push({
    name: "VPN provider ASN",
    weight: 45,
    detected: isVpnProvider,
    detail: isVpnProvider
      ? `IP belongs to a known VPN provider network (${edge.org})`
      : "ASN is not a known VPN provider",
  });

  const isTor = TOR_EXIT_ASN_KEYWORDS.some((kw) => combined.includes(kw));
  signals.push({
    name: "Tor exit node",
    weight: 50,
    detected: isTor,
    detail: isTor
      ? "IP is associated with the Tor network"
      : "Not a known Tor exit node",
  });

  return signals;
}

export function analyzeClientServerMismatch(
  edge: EdgeSignals,
  client: ClientSignals,
): VpnSignal[] {
  const signals: VpnSignal[] = [];

  // Timezone mismatch: browser TZ doesn't match IP-geolocated country
  if (edge.country && client.browserTimezone) {
    const expectedCountries = TZ_COUNTRY_MAP[client.browserTimezone];
    const ipCountry = edge.country.toUpperCase();

    if (expectedCountries) {
      const mismatch = !expectedCountries.includes(ipCountry);
      signals.push({
        name: "Timezone–country mismatch",
        weight: 30,
        detected: mismatch,
        detail: mismatch
          ? `Browser timezone ${client.browserTimezone} suggests ${expectedCountries.join("/")} but IP geolocates to ${ipCountry}`
          : `Browser timezone ${client.browserTimezone} is consistent with IP country ${ipCountry}`,
      });
    } else {
      const ipTzRegion = edge.timezone ? normalizeTimezoneRegion(edge.timezone) : null;
      const browserTzRegion = normalizeTimezoneRegion(client.browserTimezone);
      if (ipTzRegion && browserTzRegion) {
        const mismatch = ipTzRegion !== browserTzRegion;
        signals.push({
          name: "Timezone region mismatch",
          weight: 20,
          detected: mismatch,
          detail: mismatch
            ? `Browser timezone region (${browserTzRegion}) differs from IP timezone region (${ipTzRegion})`
            : `Browser and IP timezone regions both in ${browserTzRegion}`,
        });
      }
    }
  }

  // Language–country mismatch
  if (edge.country && client.browserLanguages.length > 0) {
    const primaryLang = client.browserLanguages[0].split("-")[0].toLowerCase();
    const langCountryHints: Record<string, string[]> = {
      en: ["US", "GB", "CA", "AU", "NZ", "IE", "SG", "ZA", "IN", "PH", "KE", "NG"],
      es: ["ES", "MX", "AR", "CO", "PE", "CL", "VE", "EC", "GT", "CU", "DO", "CR"],
      fr: ["FR", "CA", "BE", "CH", "LU", "SN", "CI", "CM", "MA", "TN", "DZ"],
      de: ["DE", "AT", "CH", "LI", "LU", "BE"],
      pt: ["BR", "PT", "AO", "MZ"],
      ja: ["JP"],
      ko: ["KR"],
      zh: ["CN", "TW", "HK", "SG"],
      ru: ["RU", "BY", "KZ", "UA"],
      ar: ["SA", "AE", "EG", "MA", "IQ", "SY", "JO", "LB", "KW", "QA", "BH", "OM"],
      it: ["IT", "CH", "SM", "VA"],
      nl: ["NL", "BE", "SR"],
      sv: ["SE", "FI"],
      no: ["NO"],
      da: ["DK"],
      fi: ["FI"],
      pl: ["PL"],
      tr: ["TR"],
      hi: ["IN"],
      th: ["TH"],
      vi: ["VN"],
    };
    const expectedCountries = langCountryHints[primaryLang];
    if (expectedCountries) {
      const ipCountry = edge.country.toUpperCase();
      const mismatch = !expectedCountries.includes(ipCountry);
      signals.push({
        name: "Language–country mismatch",
        weight: 15,
        detected: mismatch,
        detail: mismatch
          ? `Primary language "${primaryLang}" is unusual for IP country ${ipCountry}`
          : `Language "${primaryLang}" is consistent with IP country ${ipCountry}`,
      });
    }
  }

  // WebRTC IP leak detection
  if (client.webrtcIPs.length > 0 && edge.ip) {
    const edgeIpPrefix = edge.ip.split(".").slice(0, 2).join(".");
    const hasLeakedDifferentIP = client.webrtcIPs.some((ip) => {
      const prefix = ip.split(".").slice(0, 2).join(".");
      return prefix !== edgeIpPrefix && !ip.startsWith("192.168.") &&
        !ip.startsWith("10.") && !ip.startsWith("172.");
    });
    signals.push({
      name: "WebRTC IP leak",
      weight: 40,
      detected: hasLeakedDifferentIP,
      detail: hasLeakedDifferentIP
        ? `WebRTC revealed a different public IP than the one seen by the server`
        : client.webrtcIPs.length > 0
          ? "WebRTC IPs are consistent with server-visible IP"
          : "No WebRTC IPs detected",
    });
  }

  // High latency for allegedly nearby edge
  if (client.connectionRtt !== null && client.connectionRtt > 200) {
    const suspicious = client.connectionRtt > 400;
    signals.push({
      name: "Abnormal latency",
      weight: 10,
      detected: suspicious,
      detail: suspicious
        ? `Connection RTT of ${client.connectionRtt}ms suggests traffic is being routed through a distant proxy`
        : `Connection RTT of ${client.connectionRtt}ms is within normal range`,
    });
  }

  return signals;
}

export function computeVerdict(allSignals: VpnSignal[]): VpnAssessment {
  const triggered = allSignals.filter((s) => s.detected);
  const totalWeight = triggered.reduce((sum, s) => sum + s.weight, 0);
  const maxPossibleWeight = allSignals.reduce((sum, s) => sum + s.weight, 0);

  const confidence = maxPossibleWeight > 0
    ? Math.min(Math.round((totalWeight / maxPossibleWeight) * 100), 100)
    : 0;

  let verdict: VpnAssessment["verdict"];
  if (triggered.some((s) => s.name === "Tor exit node")) {
    verdict = "tor";
  } else if (triggered.some((s) => s.name === "VPN provider ASN")) {
    verdict = "likely-vpn";
  } else if (triggered.some((s) => s.name === "Datacenter ASN") && totalWeight >= 35) {
    verdict = "datacenter";
  } else if (totalWeight >= 50) {
    verdict = "likely-vpn";
  } else if (totalWeight >= 25) {
    verdict = "proxy";
  } else {
    verdict = "residential";
  }

  const summaryParts: string[] = [];
  if (verdict === "residential") {
    summaryParts.push(
      "Your connection appears to originate from a standard residential or mobile ISP.",
    );
    if (triggered.length > 0) {
      summaryParts.push(
        `${triggered.length} minor anomal${triggered.length === 1 ? "y was" : "ies were"} detected, but not enough to suggest obfuscation.`,
      );
    } else {
      summaryParts.push("No obfuscation signals were detected.");
    }
  } else if (verdict === "likely-vpn") {
    summaryParts.push(
      "Your connection shows strong indicators of VPN or tunnel usage.",
    );
    for (const s of triggered) summaryParts.push(s.detail + ".");
  } else if (verdict === "datacenter") {
    summaryParts.push(
      "Your IP is assigned to a cloud or datacenter provider, not a residential ISP.",
    );
    summaryParts.push(
      "This is typical of VPNs, proxies, or automated traffic, but can also occur with corporate networks.",
    );
  } else if (verdict === "tor") {
    summaryParts.push(
      "Your traffic appears to be routed through the Tor anonymity network.",
    );
  } else if (verdict === "proxy") {
    summaryParts.push(
      "Some signals suggest your traffic may be passing through a proxy or CDN.",
    );
    for (const s of triggered) summaryParts.push(s.detail + ".");
  } else {
    summaryParts.push("Insufficient data to make a determination.");
  }

  return {
    verdict,
    confidence,
    signals: allSignals,
    summary: summaryParts.join(" "),
  };
}
