#!/usr/bin/env bun
/**
 * Ingest PostHog API key. Appends to .env.local and .env, optionally adds to Vercel.
 * Sign up: https://app.posthog.com/signup → Project Settings → Project API Key (phc_...)
 * Same key is used for: NEXT_PUBLIC_POSTHOG_KEY (frontend) and POSTHOG_API_KEY (analytics-ingestion)
 */

const FRONTEND_KEY = "NEXT_PUBLIC_POSTHOG_KEY";
const BACKEND_KEY = "POSTHOG_API_KEY";
const ENV_LOCAL = ".env.local";
const ENV = ".env";

const value = process.argv[2] ?? (await prompt("Paste your PostHog Project API Key (phc_...): "));
if (!value?.trim()) {
  console.error("No value provided. Usage: bun run scripts/ingest-env/posthog.ts [phc_...]");
  process.exit(1);
}

const trimmed = value.trim();
if (!trimmed.startsWith("phc_")) {
  console.warn("Warning: PostHog keys typically start with phc_");
}

await appendEnv(ENV_LOCAL, FRONTEND_KEY, trimmed);
await appendEnv(ENV, BACKEND_KEY, trimmed);
console.log(`Added ${FRONTEND_KEY} to ${ENV_LOCAL}`);
console.log(`Added ${BACKEND_KEY} to ${ENV}`);

const skipVercel = process.argv.includes("--no-vercel") || !process.stdin.isTTY;
if (!skipVercel && (await confirm("Add NEXT_PUBLIC_POSTHOG_KEY to Vercel? (requires vercel CLI)"))) {
  await run("vercel", "env", "add", FRONTEND_KEY, "production", "preview", "development", "--value", trimmed, "--yes");
  console.log("Added to Vercel");
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

async function appendEnv(file: string, key: string, value: string) {
  const { writeFileSync, readFileSync, existsSync } = await import("node:fs");
  let content = existsSync(file) ? readFileSync(file, "utf-8") : "";
  const lines = content.split("\n").filter((l) => !l.startsWith(`${key}=`));
  lines.push(`${key}=${value}`);
  writeFileSync(file, lines.join("\n") + "\n");
}

async function run(...args: string[]) {
  const p = Bun.spawn(args, { stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  await p.exited;
  if (p.exitCode !== 0) throw new Error(`Command failed: ${args.join(" ")}`);
}
