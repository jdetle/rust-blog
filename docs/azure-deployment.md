# Azure deployment

This repo now targets two Azure runtimes:

- Frontend (`app/**`, `components/**`, `posts/**`) → Azure App Service (Linux, B1)
- Rust analytics service (`src/**`) → Azure Container Apps

## Frontend: Azure App Service (Linux)

Use this for `jdetle.com`.

### Azure portal provisioning

Create the web app in the `rust-blog` subscription:

1. Azure Portal → App Services → Create
2. Subscription: `rust-blog`
3. Resource group: use your existing blog RG (for example `rg-rust-blog`) or create one
4. Name: `app-rust-blog-web` (or your preferred globally unique name)
5. Publish: Code
6. Runtime stack: Node 20 LTS
7. Operating system: Linux
8. Region: same region as the rest of the blog infra
9. Pricing plan: B1 Basic

After the app exists, set:

- Startup Command: `node server.js`
- App Settings:
  - `SCM_DO_BUILD_DURING_DEPLOYMENT=false`
  - `WEBSITE_RUN_FROM_PACKAGE=1`
  - `PORT=8080`
  - all runtime env vars currently used by the frontend (`NEXT_PUBLIC_*`, `ANALYTICS_API_URL`, `RUST_API_URL`, etc.)

### GitHub Actions OIDC setup

Create a federated credential / app registration that can deploy to this App Service resource group, then add these GitHub repository secrets:

| Secret | Description |
|---|---|
| `AZUREAPPSERVICE_CLIENTID` | App registration / workload identity client id |
| `AZUREAPPSERVICE_TENANTID` | Azure tenant id |
| `AZUREAPPSERVICE_SUBSCRIPTIONID` | `rust-blog` subscription id |
| `AZUREAPPSERVICE_RG` | App Service resource group |
| `AZUREAPPSERVICE_NAME` | App Service name |

The workflow in `.github/workflows/deploy-vercel.yml` now deploys the Next.js frontend to App Service by:

1. Building Next.js in standalone mode
2. Packaging `.next/standalone`, `.next/static`, and `posts/`
3. Logging into Azure with OIDC
4. Deploying `site.zip` to the Linux web app

### Verify frontend deployment

After a deploy:

```bash
curl -I https://<app-name>.azurewebsites.net
curl https://<app-name>.azurewebsites.net/posts
```

When DNS is ready, point Cloudflare at the Azure hostname and add the custom domain inside App Service.

## Rust analytics service: Azure Container Apps

The Rust analytics service still deploys via `.github/workflows/deploy-azure.yml`.

Required secrets:

| Secret | Description |
|---|---|
| `AZURE_CLIENT_ID` | OIDC client id for Container Apps deploy |
| `AZURE_TENANT_ID` | Azure tenant id |
| `AZURE_SUBSCRIPTION_ID` | subscription id hosting the app RG |
| `AZURE_RESOURCE_GROUP` | resource group for Container Apps |
| `PLATFORM_ACR` | Azure Container Registry login server |
| `PLATFORM_SUB_ID` | subscription id that owns the ACR |
| `S10_INGEST_URL` | ingest endpoint |
| `S10_INGEST_KEY` | ingest key |
| `KEY_VAULT_NAME` | optional key vault for runtime secrets |

### Verify Container Apps deployment

```bash
az containerapp show --name ca-rust-blog --resource-group <RG> --query properties.configuration.ingress.fqdn -o tsv
curl https://<fqdn>/health
```
