#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# Fully automated deployment of the analytics service to Azure Container Apps.
#
# Prerequisites:
#   - Azure CLI installed and logged in (az login)
#   - Docker running locally
#   - .env file with COSMOS_*, POSTHOG_*, CLARITY_* variables
#
# Usage:
#   ./scripts/deploy-azure.sh [resource-group] [location]
# ---------------------------------------------------------------------------

RESOURCE_GROUP="${1:-jd-analytics-rg}"
LOCATION="${2:-eastus}"

APP_NAME="jd-analytics-api"
ACR_NAME="jdanalyticsacr"
ENV_NAME="jd-analytics-env"
IMAGE_TAG="latest"
IMAGE_REF="${ACR_NAME}.azurecr.io/${APP_NAME}:${IMAGE_TAG}"
TARGET_PORT=8080

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${PROJECT_ROOT}/.env"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log() { printf "\n\033[1;34m==> %s\033[0m\n" "$1"; }
err() { printf "\033[1;31mERROR: %s\033[0m\n" "$1" >&2; exit 1; }

require_cmd() {
    command -v "$1" >/dev/null 2>&1 || err "$1 is required but not installed."
}

read_env_var() {
    local key="$1"
    grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d'=' -f2-
}

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------

require_cmd az
require_cmd docker

az account show >/dev/null 2>&1 || err "Not logged in to Azure. Run: az login"

if [ ! -f "$ENV_FILE" ]; then
    err ".env file not found at ${ENV_FILE}. Run setup-analytics first."
fi

COSMOS_CONTACT_POINT="$(read_env_var COSMOS_CONTACT_POINT)"
COSMOS_USERNAME="$(read_env_var COSMOS_USERNAME)"
COSMOS_PASSWORD="$(read_env_var COSMOS_PASSWORD)"
POSTHOG_API_KEY="$(read_env_var POSTHOG_API_KEY)"
CLARITY_PROJECT_ID="$(read_env_var CLARITY_PROJECT_ID)"
CLARITY_EXPORT_TOKEN="$(read_env_var CLARITY_EXPORT_TOKEN)"

# ---------------------------------------------------------------------------
# 1. Resource group
# ---------------------------------------------------------------------------

log "Ensuring resource group '${RESOURCE_GROUP}' in ${LOCATION}"
az group create \
    --name "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --output none

# ---------------------------------------------------------------------------
# 2. Azure Container Registry
# ---------------------------------------------------------------------------

log "Ensuring Azure Container Registry '${ACR_NAME}'"
if ! az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
    az acr create \
        --name "$ACR_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --sku Basic \
        --admin-enabled true \
        --output none
fi

log "Logging in to ACR"
az acr login --name "$ACR_NAME"

# ---------------------------------------------------------------------------
# 3. Build and push Docker image
# ---------------------------------------------------------------------------

log "Building Docker image"
docker build -t "$IMAGE_REF" "$PROJECT_ROOT"

log "Pushing image to ACR"
docker push "$IMAGE_REF"

# ---------------------------------------------------------------------------
# 4. Container Apps environment
# ---------------------------------------------------------------------------

log "Ensuring Container Apps environment '${ENV_NAME}'"
if ! az containerapp env show --name "$ENV_NAME" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
    az containerapp env create \
        --name "$ENV_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --location "$LOCATION" \
        --output none
fi

# ---------------------------------------------------------------------------
# 5. Retrieve ACR credentials
# ---------------------------------------------------------------------------

ACR_SERVER="${ACR_NAME}.azurecr.io"
ACR_USERNAME="$(az acr credential show --name "$ACR_NAME" --query username -o tsv)"
ACR_PASSWORD="$(az acr credential show --name "$ACR_NAME" --query "passwords[0].value" -o tsv)"

# ---------------------------------------------------------------------------
# 6. Deploy (create or update) the container app
# ---------------------------------------------------------------------------

log "Deploying container app '${APP_NAME}'"

ENV_VARS="RUST_LOG=rust_blog=info,tower_http=info"
ENV_VARS="${ENV_VARS} PORT=${TARGET_PORT}"
ENV_VARS="${ENV_VARS} CONTENT_DIR=/app"

# Secrets are passed as secretref env vars
SECRET_ARGS=(
    --secrets
        "cosmos-cp=${COSMOS_CONTACT_POINT}"
        "cosmos-user=${COSMOS_USERNAME}"
        "cosmos-pass=${COSMOS_PASSWORD}"
)
SECRET_ENV=(
    "COSMOS_CONTACT_POINT=secretref:cosmos-cp"
    "COSMOS_USERNAME=secretref:cosmos-user"
    "COSMOS_PASSWORD=secretref:cosmos-pass"
)

if [ -n "$POSTHOG_API_KEY" ]; then
    SECRET_ARGS+=(
        "posthog-key=${POSTHOG_API_KEY}"
    )
    SECRET_ENV+=(
        "POSTHOG_API_KEY=secretref:posthog-key"
    )
fi

if [ -n "${CLARITY_EXPORT_TOKEN:-}" ]; then
    SECRET_ARGS+=(
        "clarity-token=${CLARITY_EXPORT_TOKEN}"
    )
    SECRET_ENV+=(
        "CLARITY_EXPORT_TOKEN=secretref:clarity-token"
    )
fi

ALL_ENV_VARS="${ENV_VARS}"
for senv in "${SECRET_ENV[@]}"; do
    ALL_ENV_VARS="${ALL_ENV_VARS} ${senv}"
done

if az containerapp show --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
    log "Updating existing container app"
    az containerapp update \
        --name "$APP_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --image "$IMAGE_REF" \
        "${SECRET_ARGS[@]}" \
        --set-env-vars $ALL_ENV_VARS \
        --output none
else
    log "Creating new container app"
    az containerapp create \
        --name "$APP_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --environment "$ENV_NAME" \
        --image "$IMAGE_REF" \
        --registry-server "$ACR_SERVER" \
        --registry-username "$ACR_USERNAME" \
        --registry-password "$ACR_PASSWORD" \
        --target-port "$TARGET_PORT" \
        --ingress external \
        --min-replicas 0 \
        --max-replicas 3 \
        --cpu 0.25 \
        --memory 0.5Gi \
        "${SECRET_ARGS[@]}" \
        --env-vars $ALL_ENV_VARS \
        --output none
fi

# ---------------------------------------------------------------------------
# 7. Print the app URL
# ---------------------------------------------------------------------------

log "Retrieving app URL"
FQDN="$(az containerapp show \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query "properties.configuration.ingress.fqdn" \
    -o tsv)"

printf "\n\033[1;32m========================================\033[0m\n"
printf "\033[1;32m  Deployment complete!\033[0m\n"
printf "\033[1;32m  URL: https://%s\033[0m\n" "$FQDN"
printf "\033[1;32m  Events endpoint: https://%s/api/events\033[0m\n" "$FQDN"
printf "\033[1;32m========================================\033[0m\n\n"

echo "To update your blog's analytics.js to point here, set:"
echo "  var API = \"https://${FQDN}/api/events\";"
echo ""
echo "To view logs:"
echo "  az containerapp logs show --name ${APP_NAME} --resource-group ${RESOURCE_GROUP} --follow"
