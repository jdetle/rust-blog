#!/usr/bin/env bun
/**
 * Ingest Google BigQuery credentials path for analytics-ingestion.
 * Enables GA4 per-user queries (user_pseudo_id = fingerprint) once implemented.
 * Requires: GA4 → BigQuery export, service account with BigQuery read.
 * Create: https://console.cloud.google.com/iam-admin/serviceaccounts
 */

const KEY = "GOOGLE_APPLICATION_CREDENTIALS";
const ENV_FILE = ".env.local";

const value =
	process.argv[2] ??
	(await prompt(
		"Path to service account JSON (e.g. ./ga4-bigquery-sa.json): ",
	));
if (!value?.trim()) {
	console.error(
		"No value provided. Usage: bun run scripts/ingest-env/google-bigquery.ts [path]",
	);
	process.exit(1);
}

const path = value.trim();
const resolved = await import("node:path").then((p) =>
	p.resolve(process.cwd(), path),
);
await appendEnv(KEY, resolved);
console.log(`Added ${KEY}=${resolved} to ${ENV_FILE} (analytics-ingestion)`);

async function prompt(msg: string): Promise<string> {
	const input = await new Promise<string>((resolve) => {
		process.stdout.write(msg);
		process.stdin.once("data", (d) => resolve(d.toString().trim()));
	});
	return input;
}

async function appendEnv(key: string, value: string) {
	const { writeFileSync, readFileSync, existsSync } = await import("node:fs");
	const content = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf-8") : "";
	const lines = content.split("\n").filter((l) => !l.startsWith(`${key}=`));
	lines.push(`${key}=${value}`);
	writeFileSync(ENV_FILE, `${lines.join("\n")}\n`);
}
