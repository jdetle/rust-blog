#!/usr/bin/env bun
/**
 * Ingest rust-api base URL (Azure Container App). Next.js `/api/rust/*` proxies here.
 *
 * Usage: bun run scripts/ingest-env/rust-api.ts [URL]
 */

const KEY = "RUST_API_URL";
const ENV_FILE = ".env.local";

const value =
	process.argv[2] ??
	(await prompt(
		"Paste rust-api URL (e.g. https://ca-rust-api.xxx.eastus2.azurecontainerapps.io): ",
	));
if (!value?.trim()) {
	console.error(
		"No value provided. Usage: bun run scripts/ingest-env/rust-api.ts [URL]",
	);
	process.exit(1);
}

const trimmed = value.trim().replace(/\/$/, "");
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

