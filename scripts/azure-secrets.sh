#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Obtain all secrets required for analytics-ingestion deployment via Azure CLI.
# Outputs shell-compatible KEY=value or .env format for use in CI/deployment.
#
# Prerequisites:
#   - Azure CLI installed and logged in (az login)
#   - Permissions to read Cosmos DB, Key Vault (if used), Container App secrets
#
# Usage:
#   ./scripts/azure-secrets.sh [resource-group]
#   ./scripts/azure-secrets.sh jd-analytics-rg > .env.azure
#   source <(./scripts/azure-secrets.sh jd-analytics-rg)
# ---------------------------------------------------------------------------

set -euo pipefail

RESOURCE_GROUP="${1:-jd-analytics-rg}"
COSMOS_ACCOUNT="${COSMOS_ACCOUNT:-jd-analytics}"
CONTAINER_APP_NAME="${CONTAINER_APP_NAME:-jd-analytics-api}"
KEY_VAULT_NAME="${KEY_VAULT_NAME:-}"

err() { echo "ERROR: $1" >&2; exit 1; }
log() { echo "# $1" >&2; }

command -v az >/dev/null 2>&1 || err "Azure CLI (az) is required."
az account show >/dev/null 2>&1 || err "Not logged in to Azure. Run: az login"

# ---------------------------------------------------------------------------
# Cosmos DB (Cassandra API) credentials
# ---------------------------------------------------------------------------
log "Fetching Cosmos DB credentials for ${COSMOS_ACCOUNT}..."

COSMOS_ENDPOINT="$(az cosmosdb show \
  --name "$COSMOS_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --query "documentEndpoint" -o tsv 2>/dev/null)" || COSMOS_ENDPOINT=""

if [ -n "$COSMOS_ENDPOINT" ]; then
  # Cassandra API: contact point is account.cassandra.cosmos.azure.com
  COSMOS_CONTACT_POINT="${COSMOS_ACCOUNT}.cassandra.cosmos.azure.com"
  COSMOS_USERNAME="$COSMOS_ACCOUNT"

  COSMOS_PRIMARY_KEY="$(az cosmosdb keys list \
    --name "$COSMOS_ACCOUNT" \
    --resource-group "$RESOURCE_GROUP" \
    --type keys \
    --query "primaryMasterKey" -o tsv 2>/dev/null)" || COSMOS_PRIMARY_KEY=""

  if [ -n "$COSMOS_PRIMARY_KEY" ]; then
    echo "COSMOS_CONTACT_POINT=${COSMOS_CONTACT_POINT}"
    echo "COSMOS_USERNAME=${COSMOS_USERNAME}"
    echo "COSMOS_PASSWORD=${COSMOS_PRIMARY_KEY}"
  else
    log "Could not retrieve Cosmos primary key. Ensure role has cosmosdb/read."
  fi
else
  log "Cosmos account '${COSMOS_ACCOUNT}' not found in ${RESOURCE_GROUP}."
fi

# ---------------------------------------------------------------------------
# Container App secrets (if app exists and has secrets)
# ---------------------------------------------------------------------------
if az containerapp show --name "$CONTAINER_APP_NAME" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
  log "Container App ${CONTAINER_APP_NAME} exists. Listing secret references (values are not exposed by CLI)..."
  az containerapp secret list \
    --name "$CONTAINER_APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query "[].name" -o tsv 2>/dev/null || true
fi

# ---------------------------------------------------------------------------
# Key Vault (if configured)
# ---------------------------------------------------------------------------
if [ -n "$KEY_VAULT_NAME" ]; then
  log "Fetching secrets from Key Vault ${KEY_VAULT_NAME}..."
  for key in POSTHOG_API_KEY CLARITY_EXPORT_TOKEN; do
    val="$(az keyvault secret show \
      --vault-name "$KEY_VAULT_NAME" \
      --name "$key" \
      --query "value" -o tsv 2>/dev/null)" || val=""
    [ -n "$val" ] && echo "${key}=${val}"
  done
else
  log "KEY_VAULT_NAME not set. PostHog/Clarity keys must be provided via .env or manual setup."
  echo "# Add to .env manually: POSTHOG_API_KEY, CLARITY_EXPORT_TOKEN (optional)"
fi

# ---------------------------------------------------------------------------
# ACR credentials (for image pull)
# ---------------------------------------------------------------------------
ACR_NAME="jdanalyticsacr"
if az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
  log "ACR ${ACR_NAME} credentials (for CI/deploy)..."
  ACR_USER="$(az acr credential show --name "$ACR_NAME" --query username -o tsv)"
  ACR_PASS="$(az acr credential show --name "$ACR_NAME" --query "passwords[0].value" -o tsv)"
  echo "ACR_SERVER=${ACR_NAME}.azurecr.io"
  echo "ACR_USERNAME=${ACR_USER}"
  echo "ACR_PASSWORD=${ACR_PASS}"
fi

# ---------------------------------------------------------------------------
# GitHub Actions: AZURE_CREDENTIALS (service principal)
# ---------------------------------------------------------------------------
log ""
log "For GitHub Actions deploy-analytics workflow, create a service principal:"
log "  az ad sp create-for-rbac --name github-rust-blog-deploy --role contributor --scopes /subscriptions/<sub-id>/resourceGroups/${RESOURCE_GROUP}"
log "  Add the JSON output as repository secret AZURE_CREDENTIALS"
