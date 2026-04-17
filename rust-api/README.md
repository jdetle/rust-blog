# rust-api

Minimal Axum HTTP service for Azure Container Apps, aligned with **jdetle/platform** (`PORT`, optional `PRISM_INGEST_URL` / `PRISM_API_KEY` / `OTEL_SERVICE_NAME`).

## Routes

| Path | Purpose |
|------|---------|
| `GET /` | JSON hello |
| `GET /health` | Liveness |
| `GET /ready` | Readiness |
| `GET /v1/info` | Version + selected env (no secrets) |

## Local

```bash
cd rust-api
RUST_LOG=info cargo run
# curl -s localhost:8080/health
```

## Docker (context = repo root)

```bash
docker build -f rust-api/Dockerfile -t rust-api:dev .
docker run --rm -p 8080:8080 rust-api:dev
```

## Azure (same subscription as rust-blog)

1. **Dedicated app subscription (optional):** from `~/one/platform`, run `./scripts/create-app-rust-api.sh` to provision `rg-rust-api`, identities, and `~/one/rust-api-infra/.secrets/azure.env`.
2. **Or** reuse `rg-rust-blog` + platform ACR: push image `rust-api:<tag>` and deploy `ca-rust-api` (see `.github/workflows/deploy-rust-api.yml`).
3. **Deploy from laptop:** `./scripts/deploy-rust-api.sh` (requires `az login` and env vars; see script header).

CI builds with `az acr build` on the self-hosted runner, same pattern as `deploy-azure.yml`.
