import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getClientIpFromHeaders } from "@/lib/client-ip";
import { analyzeServerSignals, type EdgeSignals } from "@/lib/vpn-detect";

/**
 * Returns server-side IP intelligence (geo, ASN) the browser cannot infer alone.
 * Geolocation comes from ipapi.co using the resolved visitor IP (see `getClientIpFromHeaders`).
 */
export const runtime = "edge";

export async function GET(request: NextRequest) {
	const ip = getClientIpFromHeaders(request.headers);

	let asn: string | null = null;
	let org: string | null = null;
	let city: string | null = null;
	let region: string | null = null;
	let country: string | null = null;
	let latitude: string | null = null;
	let longitude: string | null = null;
	let timezone: string | null = null;
	let isEU = false;
	let ipapiRaw: Record<string, unknown> | null = null;
	let geoFromIpapi = false;

	try {
		const target =
			ip && !ip.startsWith("127.") && !ip.startsWith("::1")
				? `https://ipapi.co/${encodeURIComponent(ip)}/json/`
				: "https://ipapi.co/json/";
		const url = new URL(target);
		const res = await fetch(url.href, { signal: AbortSignal.timeout(3000) });
		if (res.ok) {
			ipapiRaw = (await res.json()) as Record<string, unknown>;
			const ipapiErr = ipapiRaw.error === true;
			if (!ipapiErr) {
				asn = (ipapiRaw.asn as string) ?? null;
				org = (ipapiRaw.org as string) ?? null;
				isEU = (ipapiRaw.in_eu as boolean) ?? false;
				const c = ipapiRaw.city;
				const r = ipapiRaw.region;
				const co = ipapiRaw.country_code;
				const lat = ipapiRaw.latitude;
				const lon = ipapiRaw.longitude;
				const tz = ipapiRaw.timezone;
				if (typeof c === "string" && c.length > 0) {
					city = c;
					geoFromIpapi = true;
				}
				if (typeof r === "string" && r.length > 0) {
					region = r;
					geoFromIpapi = true;
				}
				if (typeof co === "string" && co.length > 0) {
					country = co;
					geoFromIpapi = true;
				}
				if (lat !== undefined && lat !== null && String(lat).length > 0) {
					latitude = String(lat);
					geoFromIpapi = true;
				}
				if (lon !== undefined && lon !== null && String(lon).length > 0) {
					longitude = String(lon);
					geoFromIpapi = true;
				}
				if (typeof tz === "string" && tz.length > 0) {
					timezone = tz;
					geoFromIpapi = true;
				}
			} else {
				asn = (ipapiRaw.asn as string) ?? null;
				org = (ipapiRaw.org as string) ?? null;
				isEU = (ipapiRaw.in_eu as boolean) ?? false;
				if (!city) city = (ipapiRaw.city as string) ?? null;
				if (!region) region = (ipapiRaw.region as string) ?? null;
				if (!country) country = (ipapiRaw.country_code as string) ?? null;
				if (!latitude) latitude = String(ipapiRaw.latitude ?? "");
				if (!longitude) longitude = String(ipapiRaw.longitude ?? "");
				if (!timezone) timezone = (ipapiRaw.timezone as string) ?? null;
			}
		}
	} catch {
		// ipapi.co down or rate-limited
	}

	const edgeSignals: EdgeSignals = {
		ip,
		city,
		region,
		country,
		latitude,
		longitude,
		timezone,
		asn,
		org,
		isEU,
	};

	const serverVpnSignals = analyzeServerSignals(edgeSignals);

	const edgePop =
		request.headers.get("x-edge-pop") ?? request.headers.get("cf-ray") ?? null;

	const provider = geoFromIpapi ? "ipapi" : "ipapi-unavailable";

	return NextResponse.json({
		edge: {
			...edgeSignals,
			pop: edgePop,
			provider,
		},
		vpnSignals: serverVpnSignals,
		ipapi: ipapiRaw
			? {
					version: ipapiRaw.version ?? null,
					network: ipapiRaw.network ?? null,
					countryName: ipapiRaw.country_name ?? null,
					regionCode: ipapiRaw.region_code ?? null,
					postalCode: ipapiRaw.postal ?? null,
					utcOffset: ipapiRaw.utc_offset ?? null,
					countryCallingCode: ipapiRaw.country_calling_code ?? null,
					currency: ipapiRaw.currency ?? null,
					currencyName: ipapiRaw.currency_name ?? null,
					languages: ipapiRaw.languages ?? null,
					asn: ipapiRaw.asn ?? null,
					org: ipapiRaw.org ?? null,
				}
			: null,
	});
}
