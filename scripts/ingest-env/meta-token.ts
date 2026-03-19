#!/usr/bin/env bun
/**
 * Ingest Meta Conversions API access token for analytics-ingestion.
 * Meta has no pull API — token is for sending server-side events.
 * Create: https://developers.facebook.com/tools/explorer → Get User Access Token
 * Or use System User token for server-side.
 */

const KEY = "META_ACCESS_TOKEN";
const ENV_FILE = ".env.local";

const value =
	process.argv[2] ??
	(await prompt("Paste your Meta access token (Conversions API): "));
if (!value?.trim()) {
	console.error(
		"No value provided. Usage: bun run scripts/ingest-env/meta-token.ts [token]",
	);
	process.exit(1);
}

await appendEnv(KEY, value.trim());
console.log(
	`Added ${KEY} to ${ENV_FILE} (analytics-ingestion, for Conversion API send)`,
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
