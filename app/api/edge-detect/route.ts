import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { analyzeServerSignals, type EdgeSignals } from "@/lib/vpn-detect";

/**
 * Edge Function: returns server-side IP intelligence that the client
 * can't reliably obtain on its own.
 *
 * Runs at the Vercel edge closest to the user. The response includes
 * geo headers, ASN/org info from ipapi.co, and server-side VPN signal
 * analysis. The client combines this with browser signals for the
 * final verdict.
 *
 * On non-Vercel environments (local dev), falls back to ipapi.co
 * for all fields.
 */
export const runtime = "edge";

export async function GET(request: NextRequest) {
	const forwarded = request.headers.get("x-forwarded-for");
	const ip = forwarded?.split(",")[0]?.trim() ?? null;

	const vercelCity = request.headers.get("x-vercel-ip-city");
	const vercelRegion = request.headers.get("x-vercel-ip-country-region");
	const vercelCountry = request.headers.get("x-vercel-ip-country");
	const vercelLat = request.headers.get("x-vercel-ip-latitude");
	const vercelLon = request.headers.get("x-vercel-ip-longitude");
	const vercelTz = request.headers.get("x-vercel-ip-timezone");

	let asn: string | null = null;
	let org: string | null = null;
	let city = vercelCity;
	let region = vercelRegion;
	let country = vercelCountry;
	let latitude = vercelLat;
	let longitude = vercelLon;
	let timezone = vercelTz;
	let isEU = false;
	let ipapiRaw: Record<string, unknown> | null = null;

	// Enrich with ipapi.co for ASN/org (Vercel doesn't provide these).
	// Also fills in geo fields when running locally (no Vercel headers).
	try {
		const target =
			ip && !ip.startsWith("127.") && !ip.startsWith("::1")
				? `https://ipapi.co/${ip}/json/`
				: "https://ipapi.co/json/";
		const url = new URL(target);
		const res = await fetch(url.href, { signal: AbortSignal.timeout(3000) });
		if (res.ok) {
			ipapiRaw = (await res.json()) as Record<string, unknown>;
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
	} catch {
		// ipapi.co down or rate-limited -- proceed with Vercel headers only
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

	const edgePop = request.headers.get("x-vercel-id")?.split("::")[0] ?? null;

	return NextResponse.json({
		edge: {
			...edgeSignals,
			pop: edgePop,
			provider: vercelCity ? "vercel-edge" : "ipapi-fallback",
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
