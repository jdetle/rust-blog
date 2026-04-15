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

const skipVercel = process.argv.includes("--no-vercel") || !process.stdin.isTTY;
if (!skipVercel && (await confirm("Add to Vercel? (requires vercel CLI)"))) {
	for (const env of ["production", "preview", "development"]) {
		await run("vercel", "env", "add", KEY, env, "--value", trimmed, "--yes");
	}
	console.log(
		`Added ${KEY} to Vercel (production, preview, development). Remove ${LEGACY_KEY} in dashboard if you no longer need it.`,
	);
}

async function prompt(msg: string): Promise<string> {
	const input = await new Promise<string>((resolve) => {
		process.stdout.write(msg);
		process.stdin.once("data", (d) => resolve(d.toString().trim()));
	});
	return input;
}

async function confirm(msg: string): Promise<boolean> {
	const r = await prompt(`${msg} [y/N]: `);
	return /^y/i.test(r);
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

async function run(...args: string[]) {
	const p = Bun.spawn(args, {
		stdin: "inherit",
		stdout: "inherit",
		stderr: "inherit",
	});
	await p.exited;
	if (p.exitCode !== 0) throw new Error(`Command failed: ${args.join(" ")}`);
}
