#!/usr/bin/env bun
/**
 * Ingest Vercel API token for analytics-ingestion.
 * Used for drain config via API. Drains PUSH to our /api/events — no pull.
 * Create: https://vercel.com/account/tokens
 */

const KEY = "VERCEL_TOKEN";
const ENV_FILE = ".env.local";

const value =
	process.argv[2] ??
	(await prompt(
		"Paste your Vercel API token (from vercel.com/account/tokens): ",
	));
if (!value?.trim()) {
	console.error(
		"No value provided. Usage: bun run scripts/ingest-env/vercel-token.ts [token]",
	);
	process.exit(1);
}

await appendEnv(KEY, value.trim());
console.log(`Added ${KEY} to ${ENV_FILE} (analytics-ingestion)`);

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
