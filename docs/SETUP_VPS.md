# VPS Setup

Minimal setup — nginx/TLS is your responsibility. Replace `example.top` with your domain.

## 1. System packages

```bash
apt update
apt install -y redis-server curl git

# Node.js 20+ (required)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v   # must be v20+

npm install -g pm2
```

## 2. Redis

```bash
systemctl enable redis-server
systemctl start redis-server
redis-cli ping   # should return PONG
```

## 3. Deploy application

```bash
git clone <your-repo-url> /opt/capture-api
cd /opt/capture-api

cp .env.example .env
nano .env
```

Required `.env` values:

```env
HOST=127.0.0.1
PORT=3000
SECRET=<long-random-string>
GUARD_SECRET=<another-long-random-string>
TURNSTILE_SITEKEY=<from-cloudflare-dashboard>
BASE_DOMAIN=example.top
REDIS_URL=redis://127.0.0.1:6379
```

```bash
npm ci --omit=dev
mkdir -p /var/log/capture-api
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd -u root --hp /root
```

## 4. Verify backend

```bash
curl http://127.0.0.1:3000/health
# {"ok":true}
```

## 5. nginx (your setup)

Example minimal config — adjust TLS paths yourself:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

upstream capture_api {
    server 127.0.0.1:3000;
}

server {
    listen 443 ssl http2;
    server_name example.top lvl1.example.top lvl2.example.top lvl3.example.top;

    ssl_certificate     /etc/ssl/capture/origin.pem;
    ssl_certificate_key /etc/ssl/capture/origin.key;

    location / {
        proxy_pass http://capture_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Required for lvl3 WebSocket
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 120s;
    }
}

server {
    listen 80;
    server_name example.top lvl1.example.top lvl2.example.top lvl3.example.top;
    return 301 https://$host$request_uri;
}
```

```bash
nginx -t && systemctl reload nginx
```

## 6. Logs

```bash
pm2 logs capture-api
pm2 status
```

## 7. Update deployment

```bash
cd /opt/capture-api
git pull
npm ci --omit=dev
pm2 restart capture-api
```
