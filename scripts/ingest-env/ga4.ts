#!/usr/bin/env bun
/**
 * Ingest GA4 Measurement ID. Prompts for value, appends to .env.local, optionally adds to Vercel.
 * Sign up: https://analytics.google.com → Admin → Data streams → Copy Measurement ID (G-XXXXXXXXXX)
 */

const KEY = "NEXT_PUBLIC_GA4_ID";
const ENV_FILE = ".env.local";

const value =
	process.argv[2] ??
	(await prompt("Paste your GA4 Measurement ID (G-XXXXXXXXXX): "));
if (!value?.trim()) {
	console.error(
		"No value provided. Usage: bun run scripts/ingest-env/ga4.ts [G-XXXXXXXXXX]",
	);
	process.exit(1);
}

const trimmed = value.trim();
if (!trimmed.startsWith("G-")) {
	console.warn("Warning: GA4 IDs typically start with G-");
}

await appendEnv(KEY, trimmed);
console.log(`Added ${KEY} to ${ENV_FILE}`);
const skipVercel = process.argv.includes("--no-vercel") || !process.stdin.isTTY;
if (!skipVercel && (await confirm("Add to Vercel? (requires vercel CLI)"))) {
	for (const env of ["production", "preview", "development"]) {
		await run("vercel", "env", "add", KEY, env, "--value", trimmed, "--yes");
	}
	console.log("Added to Vercel (production, preview, development)");
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

async function appendEnv(key: string, value: string) {
	const { writeFileSync, readFileSync, existsSync } = await import("node:fs");
	const content = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf-8") : "";
	const lines = content.split("\n").filter((l) => !l.startsWith(`${key}=`));
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
