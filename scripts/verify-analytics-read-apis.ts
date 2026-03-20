#!/usr/bin/env bun
/**
 * CI: verify read APIs for configured analytics providers after preview smoke.
 * Skips providers with missing env. Fails if any configured provider fails.
 *
 * PostHog: requires recent events (retries) — same as Rust Aggregator event pool.
 */
import {
	fetchAnalyticsWarehouseHealth,
	fetchClarityExportReadable,
	fetchPlausibleAggregateReadable,
} from "../lib/analytics-read-apis";
import { fetchEventCountRecentHours } from "../lib/posthog-api";

const POSTHOG_HOURS =
	Number.parseInt(process.env.POSTHOG_VERIFY_HOURS ?? "2", 10) || 2;
const MAX_ATTEMPTS =
	Number.parseInt(process.env.POSTHOG_VERIFY_ATTEMPTS ?? "5", 10) || 5;
const DELAY_MS =
	Number.parseInt(process.env.POSTHOG_VERIFY_DELAY_MS ?? "20000", 10) || 20000;

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

async function verifyPosthog(): Promise<boolean> {
	const key = process.env.POSTHOG_PERSONAL_API_KEY ?? "";
	const projectId = process.env.POSTHOG_PROJECT_ID ?? "";
	if (!key || !projectId) {
		console.log(
			"PostHog: skip (no POSTHOG_PERSONAL_API_KEY / POSTHOG_PROJECT_ID)",
		);
		return true;
	}

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		const count = await fetchEventCountRecentHours(POSTHOG_HOURS, {
			personalApiKey: key,
			projectId,
		});
		if (count !== null && count >= 1) {
			console.log(
				`PostHog OK: ${count} event(s) in last ${POSTHOG_HOURS}h (attempt ${attempt}/${MAX_ATTEMPTS})`,
			);
			return true;
		}
		console.warn(
			`PostHog attempt ${attempt}/${MAX_ATTEMPTS}: count=${count ?? "null"}`,
		);
		if (attempt < MAX_ATTEMPTS) await sleep(DELAY_MS);
	}
	console.error("PostHog: no events in lookback window after retries");
	return false;
}

async function verifyClarity(): Promise<boolean> {
	const token = process.env.CLARITY_EXPORT_TOKEN ?? "";
	const exportUrl = process.env.CLARITY_EXPORT_URL;
	if (!token) {
		console.log("Clarity: skip (no CLARITY_EXPORT_TOKEN)");
		return true;
	}
	const r = await fetchClarityExportReadable({
		token,
		...(exportUrl ? { exportUrl } : {}),
	});
	if (r.ok) {
		console.log("Clarity Data Export API: OK");
		return true;
	}
	console.error(`Clarity: ${r.reason}`);
	return false;
}

async function verifyPlausible(): Promise<boolean> {
	const apiKey = process.env.PLAUSIBLE_API_KEY ?? "";
	const siteId =
		process.env.PLAUSIBLE_SITE_ID ??
		process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN ??
		"";
	if (!apiKey || !siteId) {
		console.log("Plausible: skip (no PLAUSIBLE_API_KEY or site id)");
		return true;
	}
	const r = await fetchPlausibleAggregateReadable({ apiKey, siteId });
	if (r.ok) {
		console.log("Plausible Stats API: OK");
		return true;
	}
	console.error(`Plausible: ${r.reason}`);
	return false;
}

async function verifyWarehouse(): Promise<boolean> {
	const base = process.env.ANALYTICS_API_URL ?? "";
	if (!base) {
		console.log("Warehouse: skip (no ANALYTICS_API_URL)");
		return true;
	}
	const r = await fetchAnalyticsWarehouseHealth(base);
	if (r.ok) {
		console.log("Analytics warehouse /health: OK");
		return true;
	}
	console.error(`Warehouse: ${r.reason}`);
	return false;
}

async function main(): Promise<void> {
	const key = process.env.POSTHOG_PERSONAL_API_KEY ?? "";
	const projectId = process.env.POSTHOG_PROJECT_ID ?? "";
	const clarity = process.env.CLARITY_EXPORT_TOKEN ?? "";
	const plausibleKey = process.env.PLAUSIBLE_API_KEY ?? "";
	const plausibleSite =
		process.env.PLAUSIBLE_SITE_ID ??
		process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN ??
		"";
	const warehouse = process.env.ANALYTICS_API_URL ?? "";

	const anyConfigured =
		(key && projectId) ||
		clarity ||
		(plausibleKey && plausibleSite) ||
		warehouse;

	if (!anyConfigured) {
		console.error(
			"No analytics read API env configured — set at least one of: PostHog, Clarity, Plausible, ANALYTICS_API_URL",
		);
		process.exit(1);
	}

	const results = await Promise.all([
		verifyPosthog(),
		verifyClarity(),
		verifyPlausible(),
		verifyWarehouse(),
	]);

	if (results.every(Boolean)) {
		process.exit(0);
	}
	process.exit(1);
}

main();
