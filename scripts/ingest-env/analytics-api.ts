#!/usr/bin/env bun
/**
 * Ingest analytics ingestion API URL. Used by who-are-you event history and avatar proxy.
 * Set to your Azure Container App URL, e.g. https://analytics-ingestion.xxx.azurecontainerapps.io
 *
 * Writes ANALYTICS_API_URL (preferred). Removes legacy NEXT_PUBLIC_ANALYTICS_API_URL lines.
 */

const KEY = "ANALYTICS_API_URL";
const LEGACY_KEY = "NEXT_PUBLIC_ANALYTICS_API_URL";
const ENV_FILE = ".env.local";

const value =
	process.argv[2] ??
	(await prompt(
		"Paste your analytics API URL (e.g. https://analytics-ingestion.xxx.azurecontainerapps.io): ",
	));
if (!value?.trim()) {
	console.error(
		"No value provided. Usage: bun run scripts/ingest-env/analytics-api.ts [URL]",
	);
	process.exit(1);
}

const trimmed = value.trim().replace(/\/$/, "");
await appendEnv([KEY, LEGACY_KEY], KEY, trimmed);
console.log(`Added ${KEY} to ${ENV_FILE}`);

console.log(
	`Production: set ${KEY} in Azure Portal → App Service → Environment variables.`,
);

async function prompt(msg: string): Promise<string> {
	const input = await new Promise<string>((resolve) => {
		process.stdout.write(msg);
		process.stdin.once("data", (d) => resolve(d.toString().trim()));
	});
	return input;
}

async function appendEnv(removeKeys: string[], key: string, value: string) {
	const { writeFileSync, readFileSync, existsSync } = await import("node:fs");
	const content = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf-8") : "";
	const lines = content.split("\n").filter((l) => {
		return !removeKeys.some((k) => l.startsWith(`${k}=`));
	});
	lines.push(`${key}=${value}`);
	writeFileSync(ENV_FILE, `${lines.join("\n")}\n`);
}

