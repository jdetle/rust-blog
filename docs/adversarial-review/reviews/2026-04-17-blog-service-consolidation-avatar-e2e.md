# Adversarial Review: blog-service consolidation + avatar SVG e2e

## TL;DR
- decision: proceed (Option A with five required modifications)
- key reason: The structural plan is sound but has three landmines: `test-support` feature bleeding into prod images, duplicate Container App naming confusion left unresolved, and Playwright's multi-`webServer` cargo-build startup time making CI untenable
- top unresolved risk: `MemoryProfileStore` behind a compile-time feature compiles into the same Docker image unless the feature is explicitly excluded at build time
- immediate next step: Add `cargo build --no-default-features` gate in Dockerfile and define a pre-merge CI gate that fails if `test-support` is in default features

## Debate Config
- chaos_mode: off
- random_seed: 20260417
- evidence_rule: at least one of — metric, user impact, operational risk, code/arch evidence

## Persona Roster
- Persona: Mara (Backend/Rust Engineer)
  - role: Owns src/avatar.rs, src/api.rs
  - risk_posture: medium
- Persona: Dmitri (Platform/SRE)
  - role: Owns deploy workflows, Container App lifecycles
  - risk_posture: high
- Persona: Priya (Security Engineer)
  - role: Reviews all key handling and SVG sanitization paths
  - risk_posture: very high
- Persona: Chen (Product Manager)
  - role: Prioritizes shipping velocity and no user-visible regression
  - risk_posture: low
- Persona: Sam (Frontend/DX Engineer)
  - role: Owns Playwright config, Next.js env wiring
  - risk_posture: medium

## Phase 1 - Offense

**Mara (Rust Engineer):**
- The plan moves router construction into `build_router()` in `src/lib.rs`, but `analytics_ingestion.rs` starts four async side-effects at startup: Cosmos connect, aggregation loop, summarization loop, PostHog forwarder. Extracting only the router without those yields a skeletal blog-service in tests — the test assertions about `MemoryProfileStore` holding state will work, but anyone reading `build_router()` in prod will get a subtly different service than what's actually deployed. Evidence: lines 43-98 of `src/bin/analytics_ingestion.rs` — five distinct initialization steps before the router is mounted. What would reduce my concern: a `ServiceConfig` builder that separates the router from the startup side-effects cleanly.
- `generate_fake_avatar` signature change adds a `base_url: &str` parameter — but `src/api.rs` calls it by name, and `src/summarize.rs` uses its own separate `reqwest` call to Anthropic. Plan mentions injecting into `summarize.rs` but doesn't specify the seam. If summarize uses a different struct, you get two injection points that can drift.

**Dmitri (Platform/SRE):**
- We will have `ca-rust-blog` (the surviving Container App) and a deleted `ca-rust-api`, but the plan says nothing about decommissioning `ca-rust-api` in Azure. It is a live running Container App in `rg-rust-blog`. Deleting the deploy workflow does not delete the Container App. Evidence: `deploy-rust-api.yml` line 32 — `CONTAINER_APP: ca-rust-api`, same CAE and RG as `ca-rust-blog`. Left running, `ca-rust-api` consumes ACU and could receive traffic if `RUST_API_URL` in Vercel still points to it. Worst-case scenario: billing continues for an orphaned service and a stale Next.js env var silently 404s the `app/api/rust/[[...path]]/` proxy.
- Two deploy workflows (`deploy-analytics.yml` → `rg-jdetle-blog`, `deploy-azure.yml` → `rg-rust-blog`) target different resource groups. The plan retires `deploy-analytics.yml` but says nothing about whether `analytics-ingestion` Container App in `rg-jdetle-blog` should be decommissioned. There may be live traffic hitting that URL.
- `deploy-analytics.yml` uses plain `docker build` with a local runner push to a different ACR (`jdetleblogacr` vs `PLATFORM_ACR`). These are different registries. After retirement, the old ACR still exists, still has images, and nobody cleans it up.

**Priya (Security):**
- The `test-support` feature adds `MemoryProfileStore` to the compiled binary. The plan says "the binary branches on `BLOG_SERVICE_DB=memory` to skip Cosmos connect when `test-support` feature is compiled in." If the Dockerfile builds without explicitly excluding `test-support` from default features, the prod image ships the test bypass. Evidence: no proposed Cargo.toml snippet showing `test-support` is not in `default`. At a minimum: Dockerfile must explicitly specify `--no-default-features` or CI must assert `test-support ∉ default`.
- SVG sanitization in `src/avatar.rs` checks for `<script`, `javascript:`, `onload=`, `onerror=`, `<foreignobject` — but does not check for `data:` URI in `href` or `xlink:href` attributes. The test plan only covers the `<script>` rejection case. Adding a `data:` injection test should be required before merge.
- The mock Anthropic sidecar (`scripts/e2e/mock-anthropic.ts`) needs to bind to `127.0.0.1`, not `0.0.0.0`.

**Chen (Product):**
- The `/v1/info` route currently serves `service: "rust-api"` — a downstream consumer could be parsing that JSON. After merge it would report `service: "blog-service"`. If Prism's health dashboard or alerting parses `service` field, that's a silent breakage. Mitigation: preserve `service: "rust-api"` for the first deploy, rename in follow-up.
- Phase 1+2 in one PR is large — if Phase 1 needs rollback, Phase 2 goes with it.

**Sam (Frontend/DX):**
- `cargo run --features test-support --bin blog-service` in a Playwright `webServer` entry takes 45-120 seconds cold. The current `timeout: 120_000` will almost certainly miss Rust compile time in CI. Worst-case: Playwright silently times out on the Rust webServer and tests run with no backend, producing misleading 502 failures.
- The `BLOG_SERVICE_URL` fallback order needs to be explicit in `lib/analytics-ingestion-url.ts`. Vercel production still has `ANALYTICS_API_URL` set. If fallback order is wrong, adding `BLOG_SERVICE_URL` for the new endpoint would be ignored.

## Phase 2 - Defense

**Mara (Rust Engineer):**
- Answering Dmitri re: router extraction complexity: Define `pub struct ServiceConfig { pub state: AppState, pub start_background_tasks: bool }` and `pub fn build_app(cfg: ServiceConfig) -> Router`. Integration tests set `start_background_tasks: false`. This avoids the confusion without changing the external API shape.
- Answering own concern re: summarize drift: Both `avatar.rs` and `summarize.rs` should share a single `AnthropicClient` struct that holds `base_url + api_key + reqwest::Client`. This is cleaner than threading `base_url: &str` through every function signature.
- Residual risk accepted: Router extraction adds one test-only code path in `blog_service.rs`.

**Dmitri (Platform/SRE):**
- On orphaned Container Apps: Add `az containerapp delete --name analytics-ingestion --resource-group rg-jdetle-blog --yes` and `az containerapp delete --name ca-rust-api --resource-group rg-rust-blog --yes` to a migration runbook. This is a prerequisite.
- Rollout gate: Deploy `blog-service` to `ca-rust-blog` first. Smoke-test `/health` and `POST /user-profile/generate-avatar` with a real fingerprint. Only then delete old workflows and tear down `analytics-ingestion` + `ca-rust-api`.
- Rollback trigger: if `GET /health` returns non-200 for 3 consecutive minutes, revert with `az containerapp revision copy`.

**Priya (Security):**
- On `test-support` in prod: Declare `test-support` under `[features]` with no membership in `default = []`. Dockerfile uses `cargo build --release` with no `--features` flag, so it never includes `test-support` unless explicitly added. Add CI check to fail if `test-support` appears in default features.
- On `data:` URI in SVG: Agree this is required. Add unit test for `data:text/html,...` in `href`. Extend `sanitize_svg` to reject these.
- On sidecar binding: `Bun.serve({ hostname: "127.0.0.1", port: MOCK_ANTHROPIC_PORT })` — explicit fix.

**Chen (Product):**
- On `/v1/info` service name: Preserve `service: "rust-api"` as a static string for at least one full deploy cycle. Rename in a follow-up.
- On PR sizing: Gate PR2 on a post-deploy smoke of PR1. If smoke fails, PR2 is held.

**Sam (Frontend/DX):**
- On Playwright timeout: Pre-compile the blog-service binary during CI setup (`cargo build --features test-support --bin blog-service`) as a separate step before `bun run test:e2e`. Point `webServer` to the compiled binary `./target/debug/blog-service`. Timeout for that entry drops to ~10s.
- On env var priority: Clarify order in `lib/analytics-ingestion-url.ts`: `BLOG_SERVICE_URL` (new) → `ANALYTICS_API_URL` (legacy) → `NEXT_PUBLIC_ANALYTICS_API_URL` (client-side fallback).

## Phase 3 - Synthesis

### Final Vote: 5-0 for Option A with five required modifications

### Five Required Modifications
1. Introduce `src/anthropic.rs` thin client struct instead of threading `base_url: &str` through function signatures
2. Add Container App teardown runbook as part of Phase 1 (not optional)
3. Pre-compile blog-service before Playwright runs (cargo build as setup step, not cargo run in webServer)
4. CI gate asserting `test-support ∉ default features`
5. Extend `sanitize_svg` to reject `data:` URIs, with corresponding test

### Tradeoff Table
| Dimension | Decision |
|-----------|----------|
| Coverage speed | Full browser coverage in same PR batch |
| CI stability | Stable via pre-compile step |
| Complexity per PR | Two PRs; PR2 gated on PR1 smoke |
| Security | test-support + sanitize_svg fixes required before merge |

## Core Takeaways
- `src/anthropic.rs` as the single injection point prevents drift between avatar and summarize paths
- Container App teardown is required, not optional — orphaned apps are live cost and routing risks
- Pre-compile blog-service before Playwright runs — cargo run in webServer will timeout in CI
- `test-support` feature must be explicitly excluded from prod — add CI gate
- Extend SVG sanitization to cover `data:` URI injection before tests are considered complete

## Decision Memo
- recommended option: Option A with five required modifications
- unresolved risks: `<use>` cross-document SVG references (documented as known gap); Vercel env var cutover timing (manual step)
- experiments: Pre-compile step for Playwright — validate locally before committing to CI workflow
- rollout gates: (1) `GET /health` on `ca-rust-blog` post-deploy; (2) `POST /user-profile/generate-avatar` smoke before workflow deletion
- rollback trigger: Non-200 `/health` for 3 consecutive minutes → `az containerapp revision copy` to prior tag
