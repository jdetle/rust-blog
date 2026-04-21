#!/usr/bin/env bun
/**
 * Ingest GTM Container ID. Prompts for value, appends to .env.local.
 * Sign up: https://tagmanager.google.com → Create container → Copy Container ID (GTM-XXXXXX)
 */

const KEY = "NEXT_PUBLIC_GTM_ID";
const ENV_FILE = ".env.local";

const value =
	process.argv[2] ??
	(await prompt("Paste your GTM Container ID (GTM-XXXXXX): "));
if (!value?.trim()) {
	console.error(
		"No value provided. Usage: bun run scripts/ingest-env/gtm.ts [GTM-XXXXXX]",
	);
	process.exit(1);
}

const trimmed = value.trim();
if (!trimmed.startsWith("GTM-")) {
	console.warn("Warning: GTM Container IDs typically start with GTM-");
}

await appendEnv(KEY, trimmed);
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

async function appendEnv(key: string, value: string) {
	const { writeFileSync, readFileSync, existsSync } = await import("node:fs");
	const content = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf-8") : "";
	const lines = content.split("\n").filter((l) => !l.startsWith(`${key}=`));
	lines.push(`${key}=${value}`);
	writeFileSync(ENV_FILE, `${lines.join("\n")}\n`);
}

