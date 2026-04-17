# Teardown: Legacy Container Apps

After `blog-service` is confirmed healthy on `ca-rust-blog`, decommission the two
orphaned Container Apps that were retired as part of the blog-service consolidation.

## Prerequisites

1. `GET https://<ca-rust-blog-fqdn>/health` returns 200.
2. `POST https://<ca-rust-blog-fqdn>/user-profile/generate-avatar` with a real fingerprint returns an SVG.
3. Vercel production env has been updated: `BLOG_SERVICE_URL` is set to the `ca-rust-blog` FQDN.
4. You are logged in to Azure CLI with sufficient permissions (`az login`).

## Rollback trigger (stop here if triggered)

If `GET /health` on `ca-rust-blog` returns non-200 for 3 consecutive minutes:

```bash
# Roll back to the prior revision
az containerapp revision list \
  --name ca-rust-blog \
  --resource-group <AZURE_RESOURCE_GROUP> \
  --query "[].name" -o tsv

az containerapp revision copy \
  --name ca-rust-blog \
  --resource-group <AZURE_RESOURCE_GROUP> \
  --from-revision <prior-revision-name>
```

## Step 1 — Delete ca-rust-api (rg-rust-blog)

This Container App was previously deployed by `deploy-rust-api.yml` (now deleted).
It served `/health`, `/ready`, `/v1/info` which are now in `blog-service`.

```bash
az containerapp delete \
  --name ca-rust-api \
  --resource-group <AZURE_RESOURCE_GROUP> \
  --yes
```

Update or remove `RUST_API_URL` in Vercel if it still points to `ca-rust-api`.

## Step 2 — Delete analytics-ingestion (rg-jdetle-blog)

This Container App was previously deployed by `deploy-analytics.yml` (now deleted).
It used a different ACR (`jdetleblogacr`) and resource group (`rg-jdetle-blog`).

```bash
az containerapp delete \
  --name analytics-ingestion \
  --resource-group rg-jdetle-blog \
  --yes
```

If `ANALYTICS_API_URL` in Vercel still points to this app, update it to the
`ca-rust-blog` FQDN or set `BLOG_SERVICE_URL` instead.

## Step 3 — Optional: decommission jdetleblogacr

`jdetleblogacr` (used by the old `deploy-analytics.yml`) is now unused. It can be
deleted once all images in it are confirmed stale:

```bash
az acr delete --name jdetleblogacr --resource-group rg-jdetle-blog --yes
```

## Step 4 — Verify billing

Check Azure Cost Management for `rg-jdetle-blog` the following day to confirm the
Container App ACU charges have dropped to zero.
