# Runbook — `business@jdetle.com` mail alias

**Goal:** a single professional address (`business@jdetle.com`) that forwards to the author's primary inbox (`jdetle@gmail.com`), authenticates cleanly (SPF / DKIM / DMARC), and can send as `business@jdetle.com` from Gmail.

**Status:** DNS + mail setup required **before** the contact-hygiene PR (#TBD) is merged to production. The PR updates `/work-with-me` to advertise `business@jdetle.com`; merging without the mail provider configured will cause hard bounces.

## Decision: provider

Two reasonable choices. Pick one:

| Provider | Cost | Pros | Cons |
|---|---|---|---|
| **Cloudflare Email Routing** | $0 | Free; simple forwarding to any existing mailbox; DKIM automatic when DNS is on Cloudflare | Forward-only (cannot "send as" directly); needs a separate SMTP relay for outbound from Gmail |
| **Fastmail / Zoho / Google Workspace** | $3-6/mo | Full mailbox with SMTP; "send as" works natively; stronger DMARC reporting | Monthly cost; extra account to maintain |

**Recommended:** Cloudflare Email Routing (free) + Gmail "Send mail as" via Gmail's SMTP relay. Keeps a single primary inbox, costs nothing, and looks identical to recipients. If the volume of business correspondence grows, migrate to a paid mailbox later — the DNS records stay the same and only the routing endpoint changes.

This runbook covers the Cloudflare path. Swap in the provider's docs if using one of the others.

## Prerequisites

- `jdetle.com` nameservers point at Cloudflare (check: `dig NS jdetle.com`). If not, add the domain to Cloudflare first and update the registrar's NS records before proceeding.
- Access to the primary Gmail account (`jdetle@gmail.com`) for verification.

## Step-by-step

### 1. Enable Email Routing (Cloudflare)

1. Cloudflare dashboard → Websites → `jdetle.com` → Email → Email Routing.
2. Click **Get started**. Cloudflare adds MX and TXT records automatically; review and save.
3. Under **Routing rules**, add a custom address:
   - Custom address: `business@jdetle.com`
   - Action: **Send to an email**
   - Destination: `jdetle@gmail.com`
4. Under **Destination addresses**, confirm `jdetle@gmail.com` (Cloudflare sends a confirmation mail there).
5. Enable the **Catch-all** rule pointing at `jdetle@gmail.com` as a safety net during transition (optional; can be disabled later).

### 2. Verify DNS records

After Email Routing is enabled, confirm the following records exist on `jdetle.com`:

```text
jdetle.com.                MX    10  route1.mx.cloudflare.net.
jdetle.com.                MX    24  route2.mx.cloudflare.net.
jdetle.com.                MX    38  route3.mx.cloudflare.net.
jdetle.com.                TXT   "v=spf1 include:_spf.mx.cloudflare.net ~all"
```

Check from a terminal:

```bash
dig +short MX jdetle.com
dig +short TXT jdetle.com | grep spf1
```

Both should return non-empty results.

### 3. Add DKIM + DMARC (recommended, not auto-created)

Cloudflare Email Routing signs inbound forwarded mail, but outbound from Gmail via `business@jdetle.com` needs its own DKIM + a DMARC record. Without these, recipients (especially enterprise Exchange / Google Workspace accounts) may route the mail to spam.

1. **DKIM for Gmail-sent mail as `business@jdetle.com`:** this only becomes relevant once "Send mail as" (step 4) is configured and Gmail relays through `smtp.gmail.com`. Gmail handles DKIM signing for the envelope domain (gmail.com) but the `From:` header will be `business@jdetle.com`. This is a **header-domain mismatch**, so you need a DMARC policy of `p=none` to start and monitor deliverability before tightening.

2. **Add DMARC at `_dmarc.jdetle.com`:**

   ```text
   _dmarc.jdetle.com. TXT "v=DMARC1; p=none; rua=mailto:business@jdetle.com; adkim=r; aspf=r; pct=100"
   ```

   Start with `p=none` and monitor the `rua` reports for two weeks. If reports show clean alignment, move to `p=quarantine`. Only move to `p=reject` after another two weeks of clean reports and only if outbound volume is low enough to investigate any rejections manually.

3. **SPF already covers inbound forwarding.** For outbound from Gmail you can optionally extend:

   ```text
   jdetle.com. TXT "v=spf1 include:_spf.mx.cloudflare.net include:_spf.google.com ~all"
   ```

   This declares Google's servers as authorized senders for `@jdetle.com`.

### 4. Configure Gmail "Send mail as"

1. Send a test mail to `business@jdetle.com` from an external account. Verify it arrives in the Gmail inbox within ~30 seconds.
2. In Gmail → Settings → Accounts and Import → Send mail as → **Add another email address**.
3. Name: `John Detlefs`. Email: `business@jdetle.com`. Untick "Treat as an alias" if you want a Reply-To distinct from Gmail (leave ticked for simplicity).
4. SMTP server: `smtp.gmail.com`, port `587`, TLS. Username: `jdetle@gmail.com`. Password: a Gmail **app password** (not the account password; generate at myaccount.google.com → Security → App passwords).
5. Gmail sends a verification email to `business@jdetle.com` (which forwards to the same inbox). Click the verification link.
6. Set `business@jdetle.com` as the **default** send-from address.
7. Under **When replying to a message**, pick "Reply from the same address the message was sent to" so replies to `business@` stay on `business@`.

### 5. Smoke test

From a separate account:

1. Send a plain-text mail to `business@jdetle.com`; confirm Gmail receipt.
2. Reply from Gmail. Confirm the reply lands with `From: business@jdetle.com` and that inbox provider's DMARC check passes (most clients show a small "verified" indicator; Gmail shows it under "Show details" → "signed-by: gmail.com" and "mailed-by: jdetle.com").
3. Check the Cloudflare Email Routing dashboard → **Activity** shows the inbound message processed.
4. After 24 hours, open the first DMARC report attachment in `business@jdetle.com`; confirm `spf=pass` and `dkim=pass` for Google's sending IPs.

### 6. Merge the contact-hygiene PR

Only after step 5 shows clean smoke tests, merge the PR that swaps `/work-with-me` to advertise `business@jdetle.com`. If step 5 fails, leave the PR open; update DNS records; retest.

## Rollback

If mail stops working (DMARC rejections, forwarding loop, provider outage):

1. Revert the contact-hygiene PR on `main` to restore `jdetle@gmail.com` on the site.
2. In Cloudflare Email Routing, change the `business@jdetle.com` rule destination to a different primary mailbox if Gmail is the issue, or disable routing entirely to fall back on MX inheritance.
3. Keep the DMARC record at `p=none` until the root cause is known.

## Known gotchas

- **`pct=100` + `p=reject` can silently black-hole mail** from a misconfigured forwarder. Never go from `p=none` straight to `p=reject`; always stage through `p=quarantine` for at least two weeks.
- **Google Workspace recipients are strict.** If replies to enterprise customers appear to vanish, the first check is `https://mxtoolbox.com/dmarc.aspx?domain=jdetle.com` — it confirms the record and shows alignment preview.
- **Forwarding loops** happen if both Cloudflare and the destination try to route the same address. If `business@jdetle.com` forwards to `jdetle@gmail.com` and Gmail is also configured to forward `jdetle@gmail.com` somewhere that includes `business@`, the loop will bounce mail after five hops. Keep Gmail's forwarding off while routing is active.
- **App passwords expire / get revoked** when Google changes account security posture. If outbound from Gmail stops working, the first check is `myaccount.google.com` → Security → App passwords.

## Cost / effort summary

- Provider cost: $0 (Cloudflare free tier)
- One-time setup: ~45 minutes, including verification wait
- Ongoing: review DMARC reports weekly for the first month; monthly thereafter
- Reversible: yes — every step is a DNS or Gmail setting change, not a code migration
