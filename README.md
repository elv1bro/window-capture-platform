# Window Capture Platform

HTTP challenge platform for security researcher test assignments (timed capture windows, multi-level anti-bot flow).

> **Candidates:** if you found this repository while working on the test assignment, please let us know. That counts as a plus — we value honesty and the ability to find information, not hide it.

## Public repository

This project is **intentionally public**. Candidates may find it on GitHub and use the source code — that is fine and expected.

There are no hidden production credentials in this repo. Auth is by design: any login + `md5(login)`.

**Do not commit to git:**
- `.env` (real `SECRET`, `GUARD_SECRET`, Turnstile keys for production)
- VPS IPs, Cloudflare origin certificates, nginx TLS private keys

## Quick start (local)

```bash
cp .env.example .env
# Edit SECRET and GUARD_SECRET

# Requires Redis running locally
redis-server &   # or: brew services start redis

npm install
npm run dev
```

Add to `/etc/hosts` (use your domain):

```
127.0.0.1 example.top lvl1.example.top lvl2.example.top lvl3.example.top
```

Set `BASE_DOMAIN` and `COOKIE_DOMAIN` in `.env` to match.

Open:

- http://example.top:3000/ — landing
- http://lvl1.example.top:3000/ — level 1
- http://example.top:3000/docs — assignment

**Login:** any username (3–32 chars). Password = `md5(username)` hex lowercase.

Example: login `alice`, password `6384e2b2184bcbf58eccf10ca7a6563c`

## Production (VPS + pm2)

See [docs/SETUP_VPS.md](docs/SETUP_VPS.md) and [docs/SETUP_CF.md](docs/SETUP_CF.md).

```bash
npm ci --omit=dev
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Configure nginx yourself to proxy all hostnames to `127.0.0.1:3000`.

## Architecture

- One Fastify process, level detected by `Host` header
- Slot window: every 10s, random 1000–3000ms duration
- Rate limits: lvl1=10/sec, lvl2/lvl3=1 per 10 sec per login
- lvl2: captcha widget + request headers
- lvl3: queue (SSE) + signed claim via `/guard.js`
