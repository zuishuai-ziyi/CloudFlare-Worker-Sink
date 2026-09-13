---
title: 部署到 Linux VPS
description: 使用 Nitro `node-server` 预设、systemd 和 nginx 反向代理，将 Sink 自托管在 Linux VPS 上。
---

# 部署到 Linux VPS

本指南介绍如何在 Linux VPS 上用 Nitro `node-server` 预设运行 Sink。`server/utils/platform/*` 把所有 Cloudflare 专属绑定换成 Node 端的等价物：

- D1 → 单一 SQLite 数据库（`<NUXT_DATA_DIR>/sink.db`）
- KV → 同一数据库内的 `kv_store` 表
- Analytics Engine → 同一数据库内的 `access_logs` 表
- R2 → `<NUXT_DATA_DIR>/r2/` 下的文件
- Workers AI → 任意 OpenAI 兼容的 HTTP 端点

如果仍需要原版 Cloudflare 实现，它位于 `cloudflare/` git 子模块（固定在迁移到 Node 之前的提交）。该子模块内的文档是该路径下 Cloudflare 部署方式的权威说明。

## 1. 前置要求

- 一台拥有公网 IP 的 Linux VPS（已在 Ubuntu 22.04+ / Debian 12+ 上验证）
- Node.js 22 或更高版本（可用 NodeSource 的 `nodejs` 包或发行版自带的 Node 22）
- pnpm 11.11.0（`corepack enable && corepack prepare pnpm@11.11.0 --activate`）
- 在 Node 进程前置的反向代理（nginx 或 Caddy），用于终结 TLS
- 至少 1 GB 可用磁盘空间；数据库、上传文件和备份都在这里

先确定一个非 root 的系统用户，用来拥有应用目录并运行服务。下文示例使用 `sink` 与 `/opt/sink`。

## 2. 克隆仓库

仓库把原 Cloudflare 实现作为 git 子模块放在 `cloudflare/`。请显式拉取子模块，使其中文档保持同步：

```bash
sudo useradd --system --create-home --shell /bin/bash sink
sudo -u sink -H bash -lc '
  cd /opt
  git clone https://github.com/<your-fork>/Sink.git sink
  cd sink
  git submodule update --init --recursive
'
```

如果克隆时没有 `--recurse-submodules`，可以稍后在仓库根目录运行 `git submodule update --init --recursive` 拉取子模块。

## 3. 配置环境变量

从模板创建 `/opt/sink/.env` 并编辑。启动时只 `NUXT_SITE_TOKEN` 是必需的；其他都可保留默认值。

```bash
sudo -u sink cp /opt/sink/.env.example /opt/sink/.env
sudo -u sink nano /opt/sink/.env
```

VPS 安装的关键变量：

| 变量                                   | 用途                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| `NUXT_SITE_TOKEN`                      | 仪表盘和 API 密码（≥ 8 个字符，保持稳定）。**必填。**                                 |
| `PORT` / `HOST`                        | 绑定地址，默认 `0.0.0.0:3000`。通常让反向代理监听 `127.0.0.1`。                       |
| `NUXT_DATA_DIR`                        | SQLite 数据库、`r2/`、备份、访问日志存放目录。默认 `<cwd>/data`，首次访问时自动创建。 |
| `NUXT_AI_BASE_URL` / `NUXT_AI_API_KEY` | 启用 AI 绑定；必须同时设置，否则 AI 相关端点会返回 HTTP 501。                         |
| `NUXT_GEOIP_DB`                        | 可选 GeoLite2-City `.mmdb` 路径。在没有任何 `x-geo-*` 头时作为回退。                  |
| `NUXT_ANALYTICS_RETENTION_DAYS`        | 访问日志保留天数，`0` 或负数表示永久保留。                                            |
| `NUXT_DISABLE_AUTO_BACKUP`             | 设为 `true` 关闭每日 00:00 UTC 的自动备份任务。                                       |

完整列表见 `.env.example`。

## 4. 安装依赖并构建

```bash
sudo -u sink -H bash -lc '
  cd /opt/sink
  pnpm install
  pnpm build
'
```

`pnpm build` 把生产服务端产物写到 `.output/server/index.mjs`。Drizzle 迁移会在首次请求时自动应用；也可以预先运行 `pnpm db:migrate`。

## 5. 运行服务

`pnpm start` 与 `pnpm preview` 等价，都会执行 `node scripts/start.mjs`，在启动已构建的服务前加载仓库根目录的 `.env`。因此，`pnpm build` 之后再写入 `.env` 的变量（例如 `NUXT_SITE_TOKEN` 或 `NUXT_DATA_DIR`）会在运行时生效。进程环境中已存在的变量优先于 `.env`，因为加载文件不会覆盖已有变量。

```bash
sudo -u sink -H bash -lc '
  cd /opt/sink
  PORT=3000 HOST=127.0.0.1 pnpm start
'
```

直接启动产物 `node .output/server/index.mjs` 不会加载 `.env`，只能看到进程环境变量。

长期运行建议用 systemd 守护进程。

### systemd 单元

创建 `/etc/systemd/system/sink.service`：

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

然后启用并启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sink
sudo systemctl status sink
```

日志通过 journal 查看：`journalctl -u sink -f`。

`ExecStart` 运行 `scripts/start.mjs`，因此服务自身也会读取 `.env`。两种方式任一即可：`EnvironmentFile` 在 Node 启动前把变量注入进程环境，`scripts/start.mjs` 随后加载 `.env`。两者同时存在时，`EnvironmentFile` 的值优先，因为已存在于环境中的变量不会被覆盖。

## 6. 反向代理（nginx）

在 Node 进程前架一层 nginx，用于终结 TLS、传递真实客户端 IP 并注入 GeoIP 头。

最小示例：

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

### 可选：注入 geoip2 头

如果用 `ngx_http_geoip2_module` 编译的 nginx，可以直接注入 Sink 已识别的 `x-geo-*` 头，避免在 Node 端再装一份 `.mmdb`。

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
    map $geoip2_timezone     $geo_timezone { default ""; $geoip2_timezone     $geo_timezone;     }

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

只要这些头出现，Node 端就跳过 MaxMind 查询。如果代理已经注入 GeoIP，可以把 `NUXT_GEOIP_DB` 留空。

## 7. 数据目录与备份

Node 平台把一切放在 `${NUXT_DATA_DIR}` 下：

```
data/
├── sink.db              # SQLite：链接、KV shim、访问日志
├── sink.db-shm          # better-sqlite3 WAL 文件（自动管理）
├── sink.db-wal
└── r2/
    ├── images/          # 上传的社交预览图
    └── backups/         # 自动生成的 JSON 链接快照
```

- 自动备份默认 **00:00 UTC** 运行，除非把 `NUXT_DISABLE_AUTO_BACKUP` 设为 `true`。
- 手动快照可在仪表盘里触发，或调 `POST /api/backup`；同样落到 `data/r2/backups/`。
- 把 `data/` 当成敏感数据对待：里面包含链接以及任何密码相关材料。

建议：

- 把 `data/` 定期备份到异地（例如每天打到对象存储或远程主机）。
- 如果不要自动备份，可以改用 cron 形式的 `sqlite3 data/sink.db ".backup /var/backups/sink-$(date +%F).db"`，再把备份文件归档。
- 给数据库单独划一块有足够空余的文件系统；SQLite WAL 文件在 checkpoint 之前可能涨得较大。

## 8. 升级流程

Sink 升级不会触碰数据目录。常规流程：

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

Drizzle 迁移会在重启后下一次请求时自动运行（运行器会跳过 `d1_migrations` 中已记录的）。如果想不启动服务就预先应用：

```bash
sudo -u sink -H bash -lc 'cd /opt/sink && NUXT_DATA_DIR=/opt/sink/data pnpm db:migrate'
```

回滚：保留旧版本构建在 `.output/` 下，回到 `git checkout <previous-tag> && pnpm install && pnpm build` 后重启服务即可。`data/` 目录在升级过程中默认保留。

## 9. 从 Cloudflare 实例迁移链接

Cloudflare 版 Sink（保留在 `cloudflare/` 子模块）的链接导入导出 API 与 Node 版兼容。迁移步骤：

1. 在 Cloudflare 仪表盘上，通过 API 或仪表盘的导入导出功能导出链接。导出是分页的 JSON；一直请求直到 `list_complete` 为 true。
2. 按本指南部署 Node 版。
3. 用 `NUXT_SITE_TOKEN` 登录新仪表盘。
4. 调用 `POST /api/link/import`（或在仪表盘里走导入流程），把导出的 JSON 喂进去；每次请求最多 `NUXT_PUBLIC_KV_BATCH_LIMIT` 一半的条目，循环直到所有记录导入完毕。

导入遵循 Sink 标准契约：过期记录会被保留，活跃短链码冲突会被跳过（绝不覆盖），从 Sink 导出的受保护密码可以原样导入。Cloudflare 的 R2 桶和 Analytics Engine 数据**不会**自动迁移，只有链接记录会。

`cloudflare/` 子模块固定在迁移到 Node 之前的提交；其 `docs/` 是 Cloudflare 部署相关主题（Workers 绑定、KV 迁移等）的权威资料。
