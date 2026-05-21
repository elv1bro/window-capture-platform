# Cloudflare Setup

Estimated time: ~15 minutes. Replace `example.top` with your domain.

## 1. Add site

1. Cloudflare Dashboard → Add site → `example.top`
2. Select **Free** plan
3. Update nameservers at your registrar to Cloudflare NS

## 2. DNS records

| Name | Type | Content | Proxy |
|------|------|---------|-------|
| `@` (example.top) | A | `YOUR_VPS_IP` | Proxied (orange) |
| `lvl1` | A | `YOUR_VPS_IP` | **DNS only** (gray) |
| `lvl2` | A | `YOUR_VPS_IP` | Proxied (orange) |
| `lvl3` | A | `YOUR_VPS_IP` | Proxied (orange) |

`lvl1` must be gray cloud — no Cloudflare protection, direct to origin.

## 3. SSL/TLS

1. SSL/TLS → Overview → **Full (strict)**
2. Origin Server → Create Certificate
   - Hostnames: `example.top`, `*.example.top`
   - Validity: 15 years
3. Save certificate + private key on VPS (for your nginx config):
   - `/etc/ssl/capture/origin.pem`
   - `/etc/ssl/capture/origin.key`

## 4. Turnstile

1. Turnstile → Add widget
2. Domains: `example.top`
3. Widget mode: **Managed**
4. Copy **Site key** → `.env` as `TURNSTILE_SITEKEY`

For local dev, test key works: `1x00000000000000000000AA`

## 5. Configuration Rules

### Rule: LVL2 protection

- **When:** `(http.host eq "lvl2.example.top")`
- **Then:**
  - Security Level → Medium
  - Bot Fight Mode → On

### Rule: LVL3 protection

- **When:** `(http.host eq "lvl3.example.top")`
- **Then:**
  - Security Level → High
  - Bot Fight Mode → On
  - Browser Integrity Check → On

## 6. WAF Custom Rule (LVL3 Managed Challenge)

- **Name:** LVL3 Managed Challenge
- **Expression:** `(http.host eq "lvl3.example.top" and not cf.client.bot)`
- **Action:** Managed Challenge

This makes lvl3 require a real browser (stealth Playwright) while lvl2 can often be solved with HTTP clients + correct headers.

## 7. Verify

```bash
# lvl1 — direct, no CF
curl -I https://lvl1.example.top/health

# lvl2 — should show CF headers
curl -I https://lvl2.example.top/health

# lvl3 — may trigger challenge without browser
curl -I https://lvl3.example.top/health
```

## Expected difficulty gap

| Level | CF protection | Typical approach |
|-------|---------------|------------------|
| lvl1 | None (gray DNS) | `fetch`/`axios` + polling |
| lvl2 | Bot Fight Mode | HTTP client + headers + Turnstile token |
| lvl3 | Managed Challenge + WAF | Stealth Playwright + queue flow + HMAC |
