#!/usr/bin/env bash
set -euo pipefail

# Opens each analytics platform signup page and collects tracking IDs,
# then patches posts/analytics.js with the real values.

ANALYTICS_JS="posts/analytics.js"
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
RESET='\033[0m'

echo ""
echo -e "${BOLD}Analytics Platform Setup${RESET}"
echo -e "${DIM}This script opens each signup page and collects your tracking IDs.${RESET}"
echo ""

# ── Google Analytics 4 ────────────────────────────────────────────────

echo -e "${CYAN}[1/4] Google Analytics 4${RESET}"
echo "  1. Sign in at analytics.google.com"
echo "  2. Click Admin (gear icon) → Create Property"
echo "  3. Property name: jdetle.com | Timezone: US Eastern | Currency: USD"
echo "  4. Click Next → choose your business info → Create"
echo "  5. Choose platform: Web"
echo "  6. URL: https://jdetle.com | Stream name: jdetle.com"
echo "  7. Copy the Measurement ID (G-XXXXXXXXXX)"
echo ""
open "https://analytics.google.com" 2>/dev/null || xdg-open "https://analytics.google.com" 2>/dev/null || true
read -rp "  Paste your GA4 Measurement ID (or press Enter to skip): " GA4_ID

if [[ -n "$GA4_ID" ]]; then
  sed -i '' "s/GA4_ID: \"G-XXXXXXXXXX\"/GA4_ID: \"$GA4_ID\"/" "$ANALYTICS_JS" 2>/dev/null || \
  sed -i "s/GA4_ID: \"G-XXXXXXXXXX\"/GA4_ID: \"$GA4_ID\"/" "$ANALYTICS_JS"
  echo -e "  ${GREEN}✓ GA4 ID saved: $GA4_ID${RESET}"
else
  echo -e "  ${YELLOW}⏭ Skipped — update posts/analytics.js later${RESET}"
fi
echo ""

# ── Microsoft Clarity ─────────────────────────────────────────────────

echo -e "${CYAN}[2/4] Microsoft Clarity${RESET}"
echo "  1. Sign in with your Microsoft account"
echo "  2. Click 'Add new project'"
echo "  3. Name: jdetle.com | URL: https://jdetle.com"
echo "  4. Copy the Project ID from the tracking code snippet"
echo ""
open "https://clarity.microsoft.com" 2>/dev/null || xdg-open "https://clarity.microsoft.com" 2>/dev/null || true
read -rp "  Paste your Clarity Project ID (or press Enter to skip): " CLARITY_ID

if [[ -n "$CLARITY_ID" ]]; then
  sed -i '' "s/CLARITY_ID: \"XXXXXXXXXX\"/CLARITY_ID: \"$CLARITY_ID\"/" "$ANALYTICS_JS" 2>/dev/null || \
  sed -i "s/CLARITY_ID: \"XXXXXXXXXX\"/CLARITY_ID: \"$CLARITY_ID\"/" "$ANALYTICS_JS"
  echo -e "  ${GREEN}✓ Clarity ID saved: $CLARITY_ID${RESET}"
else
  echo -e "  ${YELLOW}⏭ Skipped — update posts/analytics.js later${RESET}"
fi
echo ""

# ── Plausible Analytics ───────────────────────────────────────────────

echo -e "${CYAN}[3/4] Plausible Analytics${RESET}"
echo "  1. Sign up at plausible.io (30-day free trial, then \$9/mo)"
echo "  2. Add your site domain: jdetle.com"
echo "  3. No Project ID needed — the domain in analytics.js is already set"
echo "  4. The script tag is: <script defer data-domain=\"jdetle.com\" src=\"https://plausible.io/js/script.js\"></script>"
echo ""
open "https://plausible.io/register" 2>/dev/null || xdg-open "https://plausible.io/register" 2>/dev/null || true
read -rp "  Press Enter when done (or type 'skip'): " PLAUSIBLE_DONE

if [[ "$PLAUSIBLE_DONE" == "skip" ]]; then
  echo -e "  ${YELLOW}⏭ Skipped — sign up later at plausible.io${RESET}"
else
  echo -e "  ${GREEN}✓ Plausible domain already configured as jdetle.com${RESET}"
fi
echo ""

# ── PostHog ───────────────────────────────────────────────────────────

echo -e "${CYAN}[4/4] PostHog${RESET}"
echo "  1. Sign up for a free account (1M events/mo free)"
echo "  2. Create an organization and project"
echo "  3. Go to Project Settings → find your Project API Key"
echo "  4. It starts with 'phc_' and is ~47 characters long"
echo ""
open "https://app.posthog.com/signup" 2>/dev/null || xdg-open "https://app.posthog.com/signup" 2>/dev/null || true
read -rp "  Paste your PostHog Project API Key (or press Enter to skip): " POSTHOG_KEY

if [[ -n "$POSTHOG_KEY" ]]; then
  sed -i '' "s|POSTHOG_KEY: \"phc_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX\"|POSTHOG_KEY: \"$POSTHOG_KEY\"|" "$ANALYTICS_JS" 2>/dev/null || \
  sed -i "s|POSTHOG_KEY: \"phc_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX\"|POSTHOG_KEY: \"$POSTHOG_KEY\"|" "$ANALYTICS_JS"
  echo -e "  ${GREEN}✓ PostHog key saved: ${POSTHOG_KEY:0:12}...${RESET}"
else
  echo -e "  ${YELLOW}⏭ Skipped — update posts/analytics.js later${RESET}"
fi
echo ""

# ── Vercel Analytics ──────────────────────────────────────────────────

echo -e "${CYAN}[Bonus] Vercel Analytics${RESET}"
echo "  1. Go to your Vercel dashboard → Project → Settings → Analytics"
echo "  2. Click 'Enable' — no code changes needed (already wired in analytics.js)"
echo ""
open "https://vercel.com/dashboard" 2>/dev/null || xdg-open "https://vercel.com/dashboard" 2>/dev/null || true

echo ""
echo -e "${BOLD}Done!${RESET}"
echo ""

CONFIGURED=0
[[ -n "${GA4_ID:-}" ]] && CONFIGURED=$((CONFIGURED + 1))
[[ -n "${CLARITY_ID:-}" ]] && CONFIGURED=$((CONFIGURED + 1))
[[ "$PLAUSIBLE_DONE" != "skip" ]] && CONFIGURED=$((CONFIGURED + 1))
[[ -n "${POSTHOG_KEY:-}" ]] && CONFIGURED=$((CONFIGURED + 1))

echo -e "  ${GREEN}$CONFIGURED/4 platforms configured${RESET}"
echo "  Vercel Analytics is enabled via dashboard toggle."
echo ""
echo "  To verify, run your blog locally and check the browser console"
echo "  for network requests to googletagmanager.com, clarity.ms,"
echo "  plausible.io, and posthog.com."
echo ""

if [[ $CONFIGURED -gt 0 ]]; then
  echo -e "  ${DIM}Changes made to $ANALYTICS_JS — commit when ready:${RESET}"
  echo "    cd $(pwd)"
  echo "    git add posts/analytics.js"
  echo "    git commit -m 'chore: add analytics platform IDs'"
  echo "    git push"
fi
