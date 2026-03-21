#!/usr/bin/env bun
/**
 * CI: after preview smoke, confirm PostHog has at least one event in the lookback window
 * (same project the Rust Aggregator pulls from). Retries for ingestion/query lag.
 *
 * Requires: POSTHOG_PERSONAL_API_KEY, POSTHOG_PROJECT_ID
 */
import { fetchEventCountRecentHours } from "../lib/posthog-api";

const HOURS = Number.parseInt(process.env.POSTHOG_VERIFY_HOURS ?? "2", 10) || 2;
const MAX_ATTEMPTS = Number.parseInt(process.env.POSTHOG_VERIFY_ATTEMPTS ?? "5", 10) || 5;
const DELAY_MS = Number.parseInt(process.env.POSTHOG_VERIFY_DELAY_MS ?? "20000", 10) || 20000;

const personalApiKey = process.env.POSTHOG_PERSONAL_API_KEY ?? "";
const projectId = process.env.POSTHOG_PROJECT_ID ?? "";

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
	if (!personalApiKey || !projectId) {
		console.error(
			"Missing POSTHOG_PERSONAL_API_KEY or POSTHOG_PROJECT_ID — cannot verify PostHog ingestion.",
		);
		process.exit(1);
	}

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		let count: number | null = null;
		try {
			count = await fetchEventCountRecentHours(HOURS, {
				personalApiKey,
				projectId,
			});
		} catch (err) {
			console.warn(
				`PostHog verify attempt ${attempt}/${MAX_ATTEMPTS}: fetch error — ${err instanceof Error ? err.message : err}. Retry in ${DELAY_MS}ms…`,
			);
			if (attempt < MAX_ATTEMPTS) {
				await sleep(DELAY_MS);
			}
			continue;
		}

		if (count !== null && count >= 1) {
			console.log(
				`PostHog OK: ${count} event(s) in last ${HOURS}h (attempt ${attempt}/${MAX_ATTEMPTS})`,
			);
			process.exit(0);
		}

		console.warn(
			`PostHog verify attempt ${attempt}/${MAX_ATTEMPTS}: count=${count ?? "null"}. Retry in ${DELAY_MS}ms…`,
		);

		if (attempt < MAX_ATTEMPTS) {
			await sleep(DELAY_MS);
		}
	}

	console.error(
		`PostHog verify failed: no events in last ${HOURS}h after ${MAX_ATTEMPTS} attempts.`,
	);
	process.exit(1);
}

main().catch((err) => {
	console.error("PostHog verify unexpected error:", err);
	process.exit(1);
});
