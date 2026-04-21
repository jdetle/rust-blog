#!/usr/bin/env bun
/**
 * Ingest Plausible domain. Appends to .env.local.
 * Sign up: https://plausible.io → Add website → Enter domain (e.g. jdetle.com)
 * No API key — the domain is the config value.
 */

const KEY = "NEXT_PUBLIC_PLAUSIBLE_DOMAIN";
const ENV_FILE = ".env.local";

const value =
	process.argv[2] ??
	(await prompt("Enter your Plausible domain (e.g. jdetle.com): "));
if (!value?.trim()) {
	console.error(
		"No value provided. Usage: bun run scripts/ingest-env/plausible.ts [domain]",
	);
	process.exit(1);
}

const trimmed =
	value
		.trim()
		.replace(/^https?:\/\//, "")
		.split("/")[0] ?? value.trim();
await appendEnv(KEY, trimmed);
console.log(`Added ${KEY}=${trimmed} to ${ENV_FILE}`);

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

