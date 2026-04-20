#!/usr/bin/env bash
# Run this once `app-rust-blog-web` is provisioned (after B1 quota is approved).
# Usage: bash scripts/azure-appsettings-apply.sh
#
# Secrets (ANTHROPIC_API_KEY, POSTHOG_PERSONAL_API_KEY) are read from Key Vault
# at runtime rather than stored in this file.  Fetch them first:
#   ANTHROPIC_API_KEY=$(az keyvault secret show --vault-name kvrustblog2bb8 \
#     --name anthropic-api-key --query value -o tsv)
#   POSTHOG_PERSONAL_API_KEY=$(az keyvault secret show --vault-name kvrustblog2bb8 \
#     --name posthog-api-key --query value -o tsv)
set -euo pipefail

SUBSCRIPTION="2bb80127-3a83-4b47-8e1d-034f291c04bd"
RG="rg-rust-blog"
APP="app-rust-blog-web"
KV="kvrustblog2bb8"

az account set --subscription "$SUBSCRIPTION"

ANTHROPIC_API_KEY=$(az keyvault secret show --vault-name "$KV" --name anthropic-api-key --query value -o tsv)
POSTHOG_PERSONAL_API_KEY=$(az keyvault secret show --vault-name "$KV" --name posthog-api-key --query value -o tsv)

az webapp config appsettings set \
  --name "$APP" \
  --resource-group "$RG" \
  --settings \
    SCM_DO_BUILD_DURING_DEPLOYMENT=false \
    WEBSITE_RUN_FROM_PACKAGE=1 \
    PORT=8080 \
    NEXT_PUBLIC_POSTHOG_KEY="phc_sOf9IR0gRco70ZVGBwuP8ZNTlbJkw1on9FNeVV1xNtp" \
    NEXT_PUBLIC_POSTHOG_HOST="https://us.posthog.com" \
    NEXT_PUBLIC_GA4_ID="G-S217MS7QDZ" \
    NEXT_PUBLIC_CLARITY_ID="vx6vutcs1m" \
    NEXT_PUBLIC_PLAUSIBLE_SCRIPT_ID="pa-HRDk6uSQvdeP6j3mL0toe" \
    NEXT_PUBLIC_PLAUSIBLE_DOMAIN="jdetle.com" \
    NEXT_PUBLIC_META_PIXEL_ID="169560873691070" \
    NEXT_PUBLIC_SITE_URL="https://jdetle.com" \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY="0x4AAAAAAC_y5h9W44gaxQtB" \
    ANALYTICS_API_URL="https://ca-rust-blog.ashyocean-7c5b6dba.eastus2.azurecontainerapps.io" \
    RUST_API_URL="https://ca-rust-blog.ashyocean-7c5b6dba.eastus2.azurecontainerapps.io" \
    POSTHOG_PERSONAL_API_KEY="$POSTHOG_PERSONAL_API_KEY" \
    POSTHOG_PROJECT_ID="346322" \
    ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  --output table

echo "App Service settings applied to $APP"
