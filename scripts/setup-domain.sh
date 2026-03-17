#!/usr/bin/env bash
set -euo pipefail

DOMAIN="jdetle.com"
# oakheightsllc/rust-blog — export VERCEL_PROJECT_ID and VERCEL_TEAM_ID (get from project Settings or vercel link)
VERCEL_PROJECT_ID="${VERCEL_PROJECT_ID:?Set VERCEL_PROJECT_ID (from oakheightsllc/rust-blog)}"
VERCEL_TEAM_ID="${VERCEL_TEAM_ID:?Set VERCEL_TEAM_ID (oakheightsllc team ID)}"

# ── Credential checks ────────────────────────────────────────────────
if [[ -z "${VERCEL_TOKEN:-}" ]]; then
  echo "ERROR: VERCEL_TOKEN is not set."
  echo "  Create one at https://vercel.com/account/tokens"
  echo "  Then: export VERCEL_TOKEN=<your-token>"
  exit 1
fi

if [[ -z "${GODADDY_API_KEY:-}" || -z "${GODADDY_API_SECRET:-}" ]]; then
  echo "ERROR: GODADDY_API_KEY and GODADDY_API_SECRET are not set."
  echo "  Create them at https://developer.godaddy.com/keys"
  echo "  Then: export GODADDY_API_KEY=<key> GODADDY_API_SECRET=<secret>"
  exit 1
fi

VERCEL_API="https://api.vercel.com"
GODADDY_API="https://api.godaddy.com"

vercel_curl() {
  curl -sf -H "Authorization: Bearer ${VERCEL_TOKEN}" "$@"
}

godaddy_curl() {
  curl -sf -H "Authorization: sso-key ${GODADDY_API_KEY}:${GODADDY_API_SECRET}" \
       -H "Content-Type: application/json" "$@"
}

# ── Step 1: Add domain to Vercel project ─────────────────────────────
echo "==> Adding ${DOMAIN} to Vercel project..."
ADD_RESPONSE=$(vercel_curl -X POST \
  "${VERCEL_API}/v10/projects/${VERCEL_PROJECT_ID}/domains?teamId=${VERCEL_TEAM_ID}" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"${DOMAIN}\"}" 2>&1) || true

echo "${ADD_RESPONSE}" | python3 -m json.tool 2>/dev/null || echo "${ADD_RESPONSE}"

NEEDS_VERIFICATION=$(echo "${ADD_RESPONSE}" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    verification = data.get('verification', [])
    if verification:
        for v in verification:
            if v.get('type') == 'TXT':
                print(v.get('value', ''))
                break
    else:
        print('')
except:
    print('')
" 2>/dev/null)

if [[ -z "${NEEDS_VERIFICATION}" ]]; then
  VERIFIED=$(echo "${ADD_RESPONSE}" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if data.get('verified') == True or data.get('name') == '${DOMAIN}':
        print('yes')
    elif 'error' in data:
        err = data['error']
        if 'already' in err.get('message', '').lower():
            print('already')
        else:
            print('error: ' + err.get('message', str(data)))
    else:
        print('unknown')
except:
    print('unknown')
" 2>/dev/null)

  if [[ "${VERIFIED}" == "yes" || "${VERIFIED}" == "already" ]]; then
    echo "==> Domain ${DOMAIN} is already verified and added."
  else
    echo "==> Unexpected response. Trying to get verification status..."
    GET_RESPONSE=$(vercel_curl \
      "${VERCEL_API}/v6/domains/${DOMAIN}/config?teamId=${VERCEL_TEAM_ID}" 2>&1) || true
    echo "${GET_RESPONSE}" | python3 -m json.tool 2>/dev/null || echo "${GET_RESPONSE}"
    echo ""
    echo "Could not determine TXT verification value automatically."
    echo "Check the Vercel dashboard: Settings > Domains for ${DOMAIN}"
    exit 1
  fi
else
  TXT_VALUE="${NEEDS_VERIFICATION}"
  echo ""
  echo "==> Vercel requires TXT verification."
  echo "    Record: _vercel.${DOMAIN} TXT ${TXT_VALUE}"
  echo ""

  # ── Step 2: Add TXT record via GoDaddy API ──────────────────────────
  echo "==> Adding TXT record to GoDaddy DNS..."
  godaddy_curl -X PUT \
    "${GODADDY_API}/v1/domains/${DOMAIN}/records/TXT/_vercel" \
    -d "[{\"data\": \"${TXT_VALUE}\", \"ttl\": 600}]"
  echo "    TXT record added."

  # ── Step 3: Wait for DNS propagation ─────────────────────────────────
  echo ""
  echo "==> Waiting for DNS propagation..."
  MAX_ATTEMPTS=30
  ATTEMPT=0
  while [[ ${ATTEMPT} -lt ${MAX_ATTEMPTS} ]]; do
    ATTEMPT=$((ATTEMPT + 1))
    RESOLVED=$(dig +short TXT "_vercel.${DOMAIN}" @8.8.8.8 2>/dev/null | tr -d '"' || true)
    if [[ "${RESOLVED}" == *"${TXT_VALUE}"* ]]; then
      echo "    Propagated after ~$((ATTEMPT * 10))s"
      break
    fi
    echo "    Attempt ${ATTEMPT}/${MAX_ATTEMPTS} — not yet propagated, waiting 10s..."
    sleep 10
  done

  if [[ ${ATTEMPT} -ge ${MAX_ATTEMPTS} ]]; then
    echo "WARNING: DNS did not propagate after $((MAX_ATTEMPTS * 10))s."
    echo "  The TXT record has been added. Vercel may still pick it up."
    echo "  You can re-run this script or verify manually in the Vercel dashboard."
  fi

  # ── Step 4: Ask Vercel to re-verify ──────────────────────────────────
  echo ""
  echo "==> Requesting Vercel to verify ${DOMAIN}..."
  VERIFY_RESPONSE=$(vercel_curl -X POST \
    "${VERCEL_API}/v10/projects/${VERCEL_PROJECT_ID}/domains?teamId=${VERCEL_TEAM_ID}" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"${DOMAIN}\"}" 2>&1) || true
  echo "${VERIFY_RESPONSE}" | python3 -m json.tool 2>/dev/null || echo "${VERIFY_RESPONSE}"
fi

# ── Step 5: Point DNS to Vercel (A + CNAME for www) ───────────────────
echo ""
echo "==> Updating GoDaddy DNS records to point to Vercel..."

echo "    Setting A record for @ → 76.76.21.21"
godaddy_curl -X PUT \
  "${GODADDY_API}/v1/domains/${DOMAIN}/records/A/@" \
  -d '[{"data": "76.76.21.21", "ttl": 600}]'

echo "    Setting CNAME record for www → cname.vercel-dns.com"
godaddy_curl -X PUT \
  "${GODADDY_API}/v1/domains/${DOMAIN}/records/CNAME/www" \
  -d '[{"data": "cname.vercel-dns.com", "ttl": 600}]'

echo ""
echo "==> Done. Summary:"
echo "    TXT  _vercel.${DOMAIN}  → (verification value)"
echo "    A    ${DOMAIN}          → 76.76.21.21"
echo "    CNAME www.${DOMAIN}     → cname.vercel-dns.com"
echo ""
echo "    Production URL: https://${DOMAIN}"
echo "    It may take a few minutes for SSL to provision."
