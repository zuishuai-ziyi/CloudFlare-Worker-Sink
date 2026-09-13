---
title: 配置参考
description: Sink 支持的全部环境变量——做什么、填在哪、什么时候需要。
---

# 配置参考

所有值都是字符串。布尔开关除非另有说明，使用 `true`。

Sink 在运行时从进程环境读取配置。VPS 部署下，值放在应用目录的 `.env` 中；`.env.example` 是带注释的权威清单。逐步安装（systemd、nginx、数据目录）见 [VPS 部署指南](/zh-CN/deployment/vps)。

**大多数人需要的**

- 必配：`NUXT_SITE_TOKEN`
- 通常需要：`PORT`、`HOST`、`NUXT_DATA_DIR`——默认值适用于大多数安装
- 访问分析开箱即用（本地 `access_logs` 表）；只有 `NUXT_ANALYTICS_RETENTION_DAYS` 值得调整
- 其余都是可选

## 变量填在哪里

Sink 以长期运行的 Node 进程运行，所有变量都在运行时读取。放在服务加载的 `.env` 文件中（见 [VPS 部署指南](/zh-CN/deployment/vps)），或在 systemd 单元/进程环境中导出。

::: tip 改了公开/构建变量后
少数 `NUXT_PUBLIC_*` 值会在 `pnpm build` 时写入客户端产物。请在构建前设置，修改后重新构建。
:::

## 平台绑定

Node 运行时会自动替换 Cloudflare 绑定——无需配置：

- **D1** → `<NUXT_DATA_DIR>/sink.db` 处的 SQLite 数据库
- **KV** → 同一数据库中的 `kv_store` 表
- **Analytics Engine** → 同一数据库中的 `access_logs` 表
- **R2** → `<NUXT_DATA_DIR>/r2/` 下的文件
- **AI** → 任意 OpenAI 兼容的 HTTP 端点（`NUXT_AI_BASE_URL` / `NUXT_AI_API_KEY`）

历史上的绑定名（`DB`、`KV`、`ANALYTICS`、`R2`、`AI`、`ASSETS`）和 `DEPLOY_*` 占位符只适用于 `cloudflare/` 子模块中保留的 Cloudflare 代码。

## 必须配置

::: warning `NUXT_SITE_TOKEN`
请自己设置。这是**仪表盘登录密码**，也是 **API 密码**。至少 8 个字符，越长越好。保持稳定。

如果留空，Sink 会在启动时随机生成密码，下次重启可能变化。
:::

| 变量              | 用途                      |
| ----------------- | ------------------------- |
| `NUXT_SITE_TOKEN` | 仪表盘登录密码 + API 密码 |

`PORT`、`HOST`、`NUXT_DATA_DIR` 都有安全默认值（见 `.env.example`），通常无需修改。

## 访问分析

访问分析内建：事件保存在同一 SQLite 数据库的本地 `access_logs` 表中，无需额外绑定或令牌。用 `NUXT_ANALYTICS_RETENTION_DAYS` 调整保留时长（默认 `90`；`0` 或负数表示永久保留）。

## 公开覆盖值（只在改默认时）

这些值会在 `pnpm build` 时写入客户端产物；修改后需重新构建并重启。

| 变量                              | 默认 | 用途                                 |
| --------------------------------- | ---- | ------------------------------------ |
| `NUXT_PUBLIC_PREVIEW_MODE`        | 空   | `true` = 演示模式（链接只活 5 分钟） |
| `NUXT_PUBLIC_SLUG_DEFAULT_LENGTH` | `6`  | 自动生成短链码的长度                 |
| `NUXT_PUBLIC_KV_BATCH_LIMIT`      | `50` | 导出每页条数；导入每次最多一半       |

## 可选配置

### 构建时选项

| 变量            | 何时生效                                                                   |
| --------------- | -------------------------------------------------------------------------- |
| `NUXT_API_CORS` | 严格等于 `true` 时，允许其他网站的浏览器调用 `/api/**`（CORS）。仍需要登录 |

### 运行时选项

| 变量                                                | 用途                                                           |
| --------------------------------------------------- | -------------------------------------------------------------- |
| `NUXT_HOME_URL`                                     | 非空则把 `/` 重定向到该 URL；空则重定向到 `/dashboard`         |
| `NUXT_NOT_FOUND_REDIRECT`                           | 未知短链码跳到哪里（**始终 HTTP 302**）                        |
| `NUXT_CF_ACCESS_TEAM_DOMAIN` + `NUXT_CF_ACCESS_AUD` | 两个都设 → 启用 [Cloudflare Access](./cloudflare-access)       |
| `NUXT_SAFE_BROWSING_DOH`                            | 用于检查不安全域名的 DNS-over-HTTPS 地址（未设置 `unsafe` 时） |
| `NUXT_WEBHOOK_URL`                                  | [点击 Webhook](./webhooks) 的 HTTP(S) 地址                     |
| `NUXT_WEBHOOK_SECRET`                               | 可选签名密钥，以 `whsec_` 开头                                 |

安全浏览示例：Cloudflare Family DNS `https://family.cloudflare-dns.com/dns-query`。另见[链接功能](/zh-CN/features/links)。

## 高级默认值（通常不用改）

| 变量                            | 默认                         | 用途                                                           |
| ------------------------------- | ---------------------------- | -------------------------------------------------------------- |
| `NUXT_REDIRECT_STATUS_CODE`     | `301`                        | 普通跳转状态码（也可用 `302`/`307`/`308`）                     |
| `NUXT_LINK_CACHE_TTL`           | `60`                         | KV 缓存将已解析链接视为新鲜的秒数                              |
| `NUXT_REDIRECT_WITH_QUERY`      | `false`                      | `true` 时把访客查询参数接到目标 URL                            |
| `NUXT_REDIRECT_NO_STORE`        | `false`                      | `true` 时要求浏览器不要缓存这次跳转                            |
| `NUXT_CASE_SENSITIVE`           | `false`                      | `true` 时自定义短链码区分大小写（`Docs` ≠ `docs`）             |
| `NUXT_ANALYTICS_RETENTION_DAYS` | `90`                         | `access_logs` 保留天数；`0` 或负数表示永久保留                 |
| `NUXT_LIST_QUERY_LIMIT`         | `500`                        | 分析列表最大行数                                               |
| `NUXT_DISABLE_BOT_ACCESS_LOG`   | `false`                      | `true` 时从分析和 Webhook 排除机器人                           |
| `NUXT_DISABLE_AUTO_BACKUP`      | `false`                      | `true` 时关闭每日 00:00 UTC 的自动备份任务                     |
| `NUXT_AI_BASE_URL`              | 空                           | OpenAI 兼容端点；未设置时 AI 路由返回 HTTP 501                 |
| `NUXT_AI_API_KEY`               | 空                           | 上面端点的 API 密钥；两者都设置才启用 AI                       |
| `NUXT_AI_MODEL`                 | `@cf/qwen/qwen3-30b-a3b-fp8` | 传给上游提供方的模型名                                         |
| `NUXT_AI_PROMPT`                | 内置                         | 自定义短链提示词必须保留 `{slugRegex}`                         |
| `NUXT_AI_OG_PROMPT`             | 内置                         | 自定义社交预览提示词                                           |
| `NUXT_GEOIP_DB`                 | 空                           | 可选 GeoLite2-City `.mmdb` 路径；代理未发送 `x-geo-*` 头时使用 |

权威的带注释清单见 `.env.example`，另见[访问分析](/zh-CN/features/analytics)和 [API](/zh-CN/api/)。
