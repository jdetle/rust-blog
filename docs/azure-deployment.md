# Azure Deployment Readiness

Checklist to deploy the analytics-ingestion service to Azure Container Apps.

## Prerequisites

- [ ] Azure CLI installed (`az --version`)
- [ ] Logged in (`az login`)
- [ ] Docker installed (for local build/push)

## 1. Obtain Secrets

Run the secrets script to gather all required values:

```bash
./scripts/azure-secrets.sh [resource-group] > .env.azure
```

Or source directly (use with caution—exposes secrets in shell):

```bash
source <(./scripts/azure-secrets.sh jd-analytics-rg)
```

Required for analytics-ingestion:

| Variable | Source |
|----------|--------|
| COSMOS_CONTACT_POINT | Cosmos DB Cassandra API |
| COSMOS_USERNAME | Cosmos account name |
| COSMOS_PASSWORD | Cosmos primary key |
| POSTHOG_API_KEY | Key Vault or .env (from PostHog) |
| CLARITY_EXPORT_TOKEN | Key Vault or .env (optional) |

## 2. GitHub Actions: AZURE_CREDENTIALS

Create a service principal for deploy-analytics workflow:

```bash
az ad sp create-for-rbac \
  --name github-rust-blog-deploy \
  --role contributor \
  --scopes /subscriptions/<SUB_ID>/resourceGroups/<RG> \
  --sdk-auth
```

Add the JSON output as repository secret `AZURE_CREDENTIALS`.

## 3. Repository Variables

Set in GitHub → Settings → Secrets and variables → Actions:

| Variable | Description |
|----------|-------------|
| ACR_NAME | Azure Container Registry name (default: jdetleblogacr) |
| AZURE_RESOURCE_GROUP | Resource group (default: rg-jdetle-blog) |
| CONTAINER_APP_NAME | Container App name (default: analytics-ingestion) |

## 4. Deploy

**Via GitHub Actions:** Push to `main` (or workflow_dispatch). The `.github/workflows/deploy-analytics.yml` builds and deploys on changes to `src/`, `Cargo.toml`, or `Dockerfile`.

**Locally:** `./scripts/deploy-azure.sh [resource-group] [location]`

## 5. Verify

```bash
az containerapp show --name <CONTAINER_APP_NAME> --resource-group <RG> --query properties.configuration.ingress.fqdn -o tsv
curl https://<FQDN>/health
```
