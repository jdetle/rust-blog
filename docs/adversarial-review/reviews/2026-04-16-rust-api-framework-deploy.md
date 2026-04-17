# Adversarial review: rust-api framework + ACR deploy (2026-04-16)

**Chaos mode:** high  
**Scope:** `rust-api/` Axum binary, `deploy-rust-api.yml`, `scripts/deploy-rust-api.sh`, CI job for `rust-api`.

## Offense

- **Second Container App** (`ca-rust-api`) shares `id-rust-blog`, `cae-rust-blog`, and Prism secrets with `ca-rust-blog` — a mis-keyed secret or wrong RG breaks both deploy paths.
- **Self-hosted runner** (`azcaj`) must be healthy; workflow is a no-op on forks without secrets.
- **First `az containerapp create`** passes empty `PRISM_*` if secrets missing in GitHub — same assumption as `deploy-azure.yml`.

## Defense

- **Parity with `deploy-azure.yml`:** same `az acr build` context (repo root), `Ensure Container Apps Environment`, registry identity, and Prism env/secrets pattern.
- **Local script** mirrors CI; optional `RUST_API_AZURE_ENV` file for laptop deploy.
- **CI** runs `cargo check` / `clippy` on `rust-api` only so the main crate is unchanged.

## Synthesis

- **Decision:** Proceed with push; aligns with jdetle/platform + existing Azure wiring.
- **Unresolved risk:** none blocking for framework-only (production traffic still depends on DNS/routing choices outside this diff).
- **Follow-up:** confirm `ca-rust-api` FQDN and any front-door / CNAME when exposing publicly.
