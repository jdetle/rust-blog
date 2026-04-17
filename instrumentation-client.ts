/**
 * rust-blog browser instrumentation — @s10/web SDK.
 * Replaces posthog-js; sends SignalEnvelope v2 to s10-ingest.
 *
 * Loaded once via Next.js instrumentation-client.ts entrypoint.
 * Works in the browser only (typeof window !== "undefined").
 */
import { createS10 } from "@s10/web";

const S10_INGEST_URL =
  process.env.NEXT_PUBLIC_S10_INGEST_URL ?? "";

const S10_INGEST_KEY =
  process.env.NEXT_PUBLIC_S10_INGEST_KEY ?? "";

if (
  typeof window !== "undefined" &&
  S10_INGEST_URL.length > 0 &&
  S10_INGEST_KEY.length > 0
) {
  const s10 = createS10({
    ingestUrl: S10_INGEST_URL,
    key: S10_INGEST_KEY,
    autoPageViews: true,
    autoWebVitals: true,
    debug: process.env.NODE_ENV === "development",
  });

  // Expose for DevTools and legacy checks.
  (window as Window & { s10?: ReturnType<typeof createS10> }).s10 = s10;
}
