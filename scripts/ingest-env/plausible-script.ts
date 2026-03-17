#!/usr/bin/env bun
/**
 * Ingest Plausible custom script ID (pa-XXXXXXXX). Appends to .env.local, optionally adds to Vercel.
 * Use when you have a custom Plausible script URL (e.g. pa-HRDk6uSQvdeP6j3mL0toe).
 * Script URL: https://plausible.io/js/{SCRIPT_ID}.js
 */

const KEY = "NEXT_PUBLIC_PLAUSIBLE_SCRIPT_ID";
const ENV_FILE = ".env.local";

const value =
	process.argv[2] ??
	(await prompt("Paste your Plausible custom script ID (pa-XXXXXXXX): "));
if (!value?.trim()) {
	console.error(
		"No value provided. Usage: bun run scripts/ingest-env/plausible-script.ts [pa-XXXXXXXX]",
	);
	process.exit(1);
}

const trimmed = value.trim().replace(/\.js$/, "");
if (!trimmed.startsWith("pa-")) {
	console.warn("Warning: Plausible custom script IDs typically start with pa-");
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
