#!/usr/bin/env bash
# deploy-rust-api.sh — build rust-api image via ACR Tasks and update Container App (same pattern as deploy-azure.yml).
#
# Prerequisites:
#   az login (or service principal env from ~/one/rust-api-infra/.secrets/azure.env)
#
# Environment (or source a file):
#   PLATFORM_ACR   — full login server, e.g. acrplatform123.azurecr.io (required)
#   AZURE_RESOURCE_GROUP — e.g. rg-rust-blog (shared with rust-blog) or rg-rust-api
#   Optional: AZURE_SUBSCRIPTION_ID if not default
#
# Optional: deploy platform min-stack instead (separate subscription):
#   PLATFORM_ROOT=~/one/platform ./scripts/deploy-app-min-stack.sh --name rust-api --image $PLATFORM_ACR/rust-api:tag
#
# Usage:
#   ./scripts/deploy-rust-api.sh
#   TAG=v1 ./scripts/deploy-rust-api.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SECRETS_FILE="${RUST_API_AZURE_ENV:-$HOME/one/rust-api-infra/.secrets/azure.env}"
if [[ -f "$SECRETS_FILE" ]]; then
	# shellcheck disable=SC1090
	source "$SECRETS_FILE"
fi

: "${PLATFORM_ACR:?Set PLATFORM_ACR (e.g. from platform secrets) or source $SECRETS_FILE}"
: "${AZURE_RESOURCE_GROUP:?Set AZURE_RESOURCE_GROUP}"

TAG="${TAG:-$(git rev-parse --short HEAD)}"
APP_NAME="rust-api"
CONTAINER_APP="${RUST_API_CONTAINER_APP:-ca-rust-api}"
CAE_NAME="${CAE_NAME:-cae-rust-blog}"
LOCATION="${LOCATION:-eastus2}"
IDENTITY_NAME="${RUST_API_IDENTITY_NAME:-id-rust-blog}"

ACR_NAME="${PLATFORM_ACR%%.*}"

echo "Building $APP_NAME:$TAG in ACR $ACR_NAME …"
az acr build \
	--registry "$ACR_NAME" \
	--image "${APP_NAME}:${TAG}" \
	--file rust-api/Dockerfile \
	.

IMAGE="${PLATFORM_ACR}/${APP_NAME}:${TAG}"
echo "Image: $IMAGE"

az extension add --name containerapp --upgrade --yes 2>/dev/null || true

IDENTITY_ID=$(az identity show \
	--name "$IDENTITY_NAME" \
	--resource-group "$AZURE_RESOURCE_GROUP" \
	--query id -o tsv)

if ! az containerapp show --name "$CONTAINER_APP" --resource-group "$AZURE_RESOURCE_GROUP" &>/dev/null; then
	echo "Creating Container App: $CONTAINER_APP (env $CAE_NAME)"
	az provider register -n Microsoft.App --wait 2>/dev/null || true
	if ! az containerapp env show --name "$CAE_NAME" --resource-group "$AZURE_RESOURCE_GROUP" &>/dev/null; then
		echo "Container Apps env $CAE_NAME missing — create it (e.g. run deploy-azure once) or set CAE_NAME."
		exit 1
	fi
	PRISM_URL="${PRISM_INGEST_URL:-}"
	PRISM_KEY="${PRISM_API_KEY:-}"
	ENV_ARGS=(
		"RUST_LOG=info"
		"OTEL_SERVICE_NAME=rust-api"
	)
	SECRET_ARGS=()
	if [[ -n "${PRISM_URL:-}" ]]; then
		ENV_ARGS+=("PRISM_INGEST_URL=${PRISM_URL}")
	fi
	if [[ -n "${PRISM_KEY:-}" ]]; then
		ENV_ARGS+=("PRISM_API_KEY=secretref:prism-api-key")
		SECRET_ARGS+=(--secrets "prism-api-key=${PRISM_KEY}")
	fi
	az containerapp create \
		--name "$CONTAINER_APP" \
		--resource-group "$AZURE_RESOURCE_GROUP" \
		--environment "$CAE_NAME" \
		--image "$IMAGE" \
		--target-port 8080 \
		--ingress external \
		--min-replicas 0 \
		--max-replicas 3 \
		--user-assigned "$IDENTITY_ID" \
		--registry-server "$PLATFORM_ACR" \
		--registry-identity "$IDENTITY_ID" \
		--env-vars "${ENV_ARGS[@]}" \
		${SECRET_ARGS[@]+"${SECRET_ARGS[@]}"} \
		--output none
else
	echo "Updating image on: $CONTAINER_APP"
	az containerapp registry set \
		--name "$CONTAINER_APP" \
		--resource-group "$AZURE_RESOURCE_GROUP" \
		--server "$PLATFORM_ACR" \
		--identity "$IDENTITY_ID" \
		--output none
	az containerapp update \
		--name "$CONTAINER_APP" \
		--resource-group "$AZURE_RESOURCE_GROUP" \
		--image "$IMAGE" \
		--output none
fi

URL=$(az containerapp show \
	--name "$CONTAINER_APP" --resource-group "$AZURE_RESOURCE_GROUP" \
	--query properties.configuration.ingress.fqdn -o tsv 2>/dev/null || echo "n/a")
echo "Deployed $CONTAINER_APP → https://${URL}"
