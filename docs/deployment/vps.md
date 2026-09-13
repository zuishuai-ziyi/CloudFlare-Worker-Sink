---
title: Deploy on a Linux VPS
description: Self-host Sink on a Linux VPS using the Node.js Nitro preset, systemd, and an nginx reverse proxy.
---

# Deploy on a Linux VPS

This guide walks through running Sink on a Linux VPS with the Nitro `node-server` preset. All Cloudflare-specific bindings are replaced by Node-side equivalents in `server/utils/platform/*`:

- D1 → a single SQLite database (`<NUXT_DATA_DIR>/sink.db`)
- KV → a table inside the same database (`kv_store`)
- Analytics Engine → the `access_logs` table inside the same database
- R2 → files under `<NUXT_DATA_DIR>/r2/`
- Workers AI → any OpenAI-compatible HTTP endpoint

If you still need the original Cloudflare implementation, it lives in the `cloudflare/` git submodule (pinned to the commit before the Node port). See the docs inside that submodule for the Cloudflare-specific deployment flow.

## 1. Prerequisites

- Linux VPS with a public IP (Ubuntu 22.04+ / Debian 12+ tested)
- Node.js 22 or newer (use the `nodejs` package from NodeSource or your distro's Node 22)
- pnpm 11.11.0 (`corepack enable && corepack prepare pnpm@11.11.0 --activate`)
- A reverse proxy (nginx or Caddy) terminating TLS in front of the Node process
- At least 1 GB of free disk space; the database, file uploads, and backups all live here

Decide on a non-root system user that will own the application directory and run the service. The examples below use `sink` and `/opt/sink`.

## 2. Clone the repository

The repository includes the original Cloudflare implementation as a git submodule at `cloudflare/`. Pull it explicitly so the docs in that folder stay in sync:

```bash
sudo useradd --system --create-home --shell /bin/bash sink
sudo -u sink -H bash -lc '
  cd /opt
  git clone https://github.com/<your-fork>/Sink.git sink
  cd sink
  git submodule update --init --recursive
'
```

If you cloned without `--recurse-submodules`, you can fetch the submodule later with `git submodule update --init --recursive` from the repository root.

## 3. Configure environment variables

Create `/opt/sink/.env` from the template and edit it. Only `NUXT_SITE_TOKEN` is strictly required to boot; everything else can stay at its default.

```bash
sudo -u sink cp /opt/sink/.env.example /opt/sink/.env
sudo -u sink nano /opt/sink/.env
```

Key variables for a VPS install:

| Variable                               | Purpose                                                                                                    |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `NUXT_SITE_TOKEN`                      | Dashboard and API password (≥ 8 characters, keep stable). **Required.**                                    |
| `PORT` / `HOST`                        | Bind address. Defaults to `0.0.0.0:3000`. Run behind the reverse proxy on `127.0.0.1`.                     |
| `NUXT_DATA_DIR`                        | Where the SQLite DB, `r2/`, backups, and access logs live. Defaults to `<cwd>/data`. Created on first use. |
| `NUXT_AI_BASE_URL` / `NUXT_AI_API_KEY` | Enable the AI binding. Both must be set; otherwise the AI endpoints return HTTP 501.                       |
| `NUXT_GEOIP_DB`                        | Optional path to a GeoLite2-City `.mmdb`. Falls back when no `x-geo-*` headers are present.                |
| `NUXT_ANALYTICS_RETENTION_DAYS`        | Days of access logs to keep. `0` or negative = forever.                                                    |
| `NUXT_DISABLE_AUTO_BACKUP`             | Set to `true` to skip the daily 00:00 UTC backup job.                                                      |

See `.env.example` for the complete list.

## 4. Install dependencies and build

```bash
sudo -u sink -H bash -lc '
  cd /opt/sink
  pnpm install
  pnpm build
'
```

`pnpm build` writes the production server bundle to `.output/server/index.mjs`. Drizzle migrations are auto-applied on the first request after boot, or you can run them ahead of time with `pnpm db:migrate`.

## 5. Run the server

`pnpm start` and `pnpm preview` are equivalent aliases for `node scripts/start.mjs`, which loads the repository-root `.env` before starting the built server. Variables written to `.env` after `pnpm build` (for example `NUXT_SITE_TOKEN` or `NUXT_DATA_DIR`) therefore take effect at runtime. Variables already present in the process environment win over `.env`, because loading the file never overwrites an existing value.

```bash
sudo -u sink -H bash -lc '
  cd /opt/sink
  PORT=3000 HOST=127.0.0.1 pnpm start
'
```

Launching the bundle directly, `node .output/server/index.mjs`, skips `.env` loading and sees only the process environment.

For a long-lived install, keep the process supervised with systemd.

### systemd unit

Create `/etc/systemd/system/sink.service`:

```ini
[Unit]
Description=Sink link shortener (Nitro node-server)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=sink
Group=sink
WorkingDirectory=/opt/sink
EnvironmentFile=/opt/sink/.env
ExecStart=/usr/bin/node /opt/sink/scripts/start.mjs
Restart=on-failure
RestartSec=5
# Allow enough time for SQLite migrations and the GeoIP reader cache.
TimeoutStopSec=20

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/opt/sink/data
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true

[Install]
WantedBy=multi-user.target
```

Then enable and start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sink
sudo systemctl status sink
```

Logs stream to the journal (`journalctl -u sink -f`).

`ExecStart` runs `scripts/start.mjs` so the service also reads `.env` on its own. Either mechanism works on its own: `EnvironmentFile` injects variables into the process environment before Node starts, and `scripts/start.mjs` loads `.env` afterwards. When both are present, `EnvironmentFile` values win because a variable already in the environment is never overwritten.

## 6. Reverse proxy (nginx)

Put nginx in front of the Node process so it can terminate TLS, forward the real client IP, and inject GeoIP headers.

Minimal example:

```nginx
server {
    listen 80;
    server_name links.example.com;

    # Redirect HTTP to HTTPS once a certificate is issued.
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name links.example.com;

    ssl_certificate     /etc/letsencrypt/live/links.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/links.example.com/privkey.pem;

    client_max_body_size 6m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
    }
}
```

### Optional: geoip2 header injection

If you compile nginx with the `ngx_http_geoip2_module`, you can populate the `x-geo-*` headers that Sink already understands. This avoids shipping a separate `.mmdb` on the Node side.

```nginx
http {
    geoip2 /var/lib/GeoIP/GeoLite2-City.mmdb {
        auto_reload 60m;
        $geoip2_city_name      city names en;
        $geoip2_region_name    subdivisions 0 names en;
        $geoip2_country_code   country iso_code;
        $geoip2_timezone       location time_zone;
        $geoip2_latitude       location latitude;
        $geoip2_longitude      location longitude;
    }

    map $geoip2_country_code $geo_country  { default ""; $geoip2_country_code $geoip2_country_code; }
    map $geoip2_region_name  $geo_region   { default ""; $geoip2_region_name  $geoip2_region_name;  }
    map $geoip2_city_name    $geo_city     { default ""; $geoip2_city_name    $geoip2_city_name;    }
    map $geoip2_timezone     $geo_timezone { default ""; $geoip2_timezone     $geoip2_timezone;     }

    server {
        listen 443 ssl http2;
        server_name links.example.com;

        # ... TLS configuration ...

        location / {
            proxy_pass http://127.0.0.1:3000;
            proxy_http_version 1.1;
            proxy_set_header Host              $host;
            proxy_set_header X-Real-IP         $remote_addr;
            proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header x-geo-country     $geo_country;
            proxy_set_header x-geo-region      $geo_region;
            proxy_set_header x-geo-city        $geo_city;
            proxy_set_header x-geo-timezone    $geo_timezone;
            proxy_set_header x-geo-latitude    $geoip2_latitude;
            proxy_set_header x-geo-longitude   $geoip2_longitude;
        }
    }
}
```

When any of these headers are present, the Node process skips the MaxMind lookup entirely. Leave `NUXT_GEOIP_DB` unset if the proxy already injects GeoIP data.

## 7. Data directory and backups

The Node platform stores everything under `${NUXT_DATA_DIR}`:

```
data/
├── sink.db              # SQLite: links, KV shim, access logs
├── sink.db-shm          # better-sqlite3 WAL files (auto-managed)
├── sink.db-wal
└── r2/
    ├── images/          # uploaded social-preview images
    └── backups/         # auto-generated JSON link snapshots
```

- Backups run automatically at **00:00 UTC** unless `NUXT_DISABLE_AUTO_BACKUP=true`.
- Manual snapshots are available from the dashboard or via `POST /api/backup`; they land in `data/r2/backups/`.
- Treat the contents of `data/` as sensitive: it includes links and any password material.

Recommendations:

- Back up `data/` off-site on a schedule (for example, a daily snapshot to object storage or a remote host).
- If you do not need automatic backups, run `cron`-style `sqlite3 data/sink.db ".backup /var/backups/sink-$(date +%F).db"` instead and back that up.
- Use a dedicated filesystem with at least a few GB free; SQLite WAL files can grow before checkpoints.

## 8. Upgrading

Sink upgrades do not touch the data directory. The routine is:

```bash
sudo -u sink -H bash -lc '
  cd /opt/sink
  git pull --rebase
  git submodule update --recursive
  pnpm install
  pnpm build
'
sudo systemctl restart sink
```

Drizzle migrations run automatically on the next request after restart (the runner skips files already recorded in `d1_migrations`). To apply them ahead of time without booting the server:

```bash
sudo -u sink -H bash -lc 'cd /opt/sink && NUXT_DATA_DIR=/opt/sink/data pnpm db:migrate'
```

Rollback: keep the previous build under `.output/`, switch back with `git checkout <previous-tag> && pnpm install && pnpm build`, then restart the service. The `data/` directory is intentionally preserved across upgrades.

## 9. Migrating links from a Cloudflare instance

The Cloudflare version of Sink (kept under the `cloudflare/` submodule) is API-compatible with the Node version for link import/export. To move an existing instance:

1. On the Cloudflare dashboard, export the links via the API or the dashboard's import/export feature. The export is a series of JSON pages; keep requesting until `list_complete` is true.
2. Deploy the Node version (this guide).
3. Sign in to the new dashboard with `NUXT_SITE_TOKEN`.
4. Call `POST /api/link/import` (or use the dashboard's import flow) with the exported JSON. Each request accepts up to half of `NUXT_PUBLIC_KV_BATCH_LIMIT` items; loop until every record has been sent.

The import honors the standard Sink contract: expired records are kept, active short-code conflicts are skipped (never overwritten), and protected passwords from a Sink export survive the trip. The Cloudflare R2 bucket and Analytics Engine data do **not** migrate automatically — only the link records do.

The `cloudflare/` submodule is pinned to the commit just before the Node port. Its `docs/` is the authoritative source for Cloudflare-specific deployment topics (Workers bindings, KV migration, etc.).
