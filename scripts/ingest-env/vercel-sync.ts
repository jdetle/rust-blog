#!/usr/bin/env bun
/**
 * Push all NEXT_PUBLIC_* vars from .env.local to Vercel.
 * Run from project root. Requires vercel CLI and Vercel project link.
 */
import { existsSync, readFileSync } from "node:fs";

const ENV_FILES = [".env.local"];

function parseEnv(content: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eq = trimmed.indexOf("=");
		if (eq <= 0) continue;
		const key = trimmed.slice(0, eq).trim();
		const value = trimmed
			.slice(eq + 1)
			.trim()
			.replace(/^["']|["']$/g, "");
		if (key.startsWith("NEXT_PUBLIC_")) {
			out[key] = value;
		}
	}
	return out;
}

const vars: Record<string, string> = {};
for (const file of ENV_FILES) {
	if (existsSync(file)) {
		Object.assign(vars, parseEnv(readFileSync(file, "utf-8")));
	}
}

const keys = Object.keys(vars);
if (keys.length === 0) {
	console.log("No NEXT_PUBLIC_* vars found in .env.local");
	process.exit(0);
}

console.log(`Pushing ${keys.length} vars to Vercel: ${keys.join(", ")}`);
for (const key of keys) {
	const value = vars[key];
	let ok = true;
	for (const env of ["production", "preview", "development"]) {
		const p = Bun.spawn(
			["vercel", "env", "add", key, env, "--value", value, "--yes"],
			{ stdin: "inherit", stdout: "pipe", stderr: "pipe" },
		);
		await p.exited;
		if (p.exitCode !== 0) {
			ok = false;
			console.error(
				`  ✗ ${key} (${env}): ${(await new Response(p.stderr).text()).trim() || "failed"}`,
			);
		}
	}
	if (ok) {
		console.log(`  ✓ ${key}`);
	}
}
console.log("Done. Redeploy to apply new env vars.");
