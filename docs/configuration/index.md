---
title: Configuration Reference
description: Every supported Sink environment variable — what it does, where to set it, and when you need it.
---

# Configuration Reference

All values are strings. Boolean switches use `true` unless noted.

Sink reads its configuration from the process environment at runtime. On the VPS deployment, values live in `.env` next to the application; `.env.example` is the authoritative, commented list. Step-by-step setup (systemd, nginx, data directory) is in the [VPS deployment guide](/deployment/vps).

**What most people need**

- Always: `NUXT_SITE_TOKEN`
- Usually: `PORT`, `HOST`, and `NUXT_DATA_DIR` — the defaults work for most installs
- Analytics works out of the box (a local `access_logs` table); only `NUXT_ANALYTICS_RETENTION_DAYS` is worth tuning
- Everything else is optional

## Where to put variables

Sink runs as a long-lived Node process, so every variable is read at runtime. Keep them in the `.env` file loaded by the server (see the [VPS deployment guide](/deployment/vps)), or export them in the systemd unit or process environment.

::: tip After changing public/build values
A few `NUXT_PUBLIC_*` values are baked into the client bundle by `pnpm build`. Set them before building and rebuild after changing them.
:::

## Platform bindings

The Node runtime replaces the Cloudflare bindings automatically — you do not configure them:

- **D1** → the SQLite database at `<NUXT_DATA_DIR>/sink.db`
- **KV** → the `kv_store` table in the same database
- **Analytics Engine** → the `access_logs` table in the same database
- **R2** → files under `<NUXT_DATA_DIR>/r2/`
- **AI** → any OpenAI-compatible HTTP endpoint (`NUXT_AI_BASE_URL` / `NUXT_AI_API_KEY`)

The historical binding names (`DB`, `KV`, `ANALYTICS`, `R2`, `AI`, `ASSETS`) and the `DEPLOY_*` placeholders only apply to the Cloudflare code kept in the `cloudflare/` submodule.

## Required

::: warning `NUXT_SITE_TOKEN`
Set this yourself. It is the **dashboard login password** and the **API password**. At least 8 characters; longer is better. Keep it stable.

If you leave it empty, Sink generates a random password at boot that can change on the next restart.
:::

| Variable          | Purpose                                   |
| ----------------- | ----------------------------------------- |
| `NUXT_SITE_TOKEN` | Dashboard login password and API password |

`PORT`, `HOST`, and `NUXT_DATA_DIR` have safe defaults (see `.env.example`) and rarely need changing.

## Analytics

Visit analytics are built in: events are stored in the local `access_logs` table inside the same SQLite database, so no extra binding or token is required. Tune retention with `NUXT_ANALYTICS_RETENTION_DAYS` (default `90`; `0` or negative keeps rows forever).

## Public overrides (only if you change defaults)

These values are baked into the client bundle by `pnpm build`; rebuild and restart after changing them.

| Variable                          | Default | Purpose                                                   |
| --------------------------------- | ------- | --------------------------------------------------------- |
| `NUXT_PUBLIC_PREVIEW_MODE`        | empty   | `true` = demo mode (links last 5 minutes)                 |
| `NUXT_PUBLIC_SLUG_DEFAULT_LENGTH` | `6`     | Length of auto-generated short codes                      |
| `NUXT_PUBLIC_KV_BATCH_LIMIT`      | `50`    | Export page size; import accepts at most half per request |

## Optional

### Build-time options

| Variable        | When it turns on                                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------- |
| `NUXT_API_CORS` | Exactly `true` allows browser apps on other sites to call `/api/**` (CORS). Login is still required |

### Runtime options

| Variable                                            | Purpose                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------ |
| `NUXT_HOME_URL`                                     | Non-empty URL redirects `/`; empty redirects to `/dashboard`             |
| `NUXT_NOT_FOUND_REDIRECT`                           | Where to send unknown short codes (**always HTTP 302**)                  |
| `NUXT_CF_ACCESS_TEAM_DOMAIN` + `NUXT_CF_ACCESS_AUD` | Both set → enable [Cloudflare Access](./cloudflare-access)               |
| `NUXT_SAFE_BROWSING_DOH`                            | DNS-over-HTTPS URL used to check unsafe domains when `unsafe` is not set |
| `NUXT_WEBHOOK_URL`                                  | HTTP(S) URL for [click webhooks](./webhooks)                             |
| `NUXT_WEBHOOK_SECRET`                               | Optional signing secret starting with `whsec_`                           |

Safe browsing example: Cloudflare Family DNS `https://family.cloudflare-dns.com/dns-query`. See also [Link Features](/features/links).

## Advanced defaults (usually leave alone)

| Variable                        | Default                      | Purpose                                                                             |
| ------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------- |
| `NUXT_REDIRECT_STATUS_CODE`     | `301`                        | Normal redirect code (`302` / `307` / `308` also work)                              |
| `NUXT_LINK_CACHE_TTL`           | `60`                         | How long the KV cache treats a resolved link as fresh (seconds)                     |
| `NUXT_REDIRECT_WITH_QUERY`      | `false`                      | `true` appends visitor query params to the target URL                               |
| `NUXT_REDIRECT_NO_STORE`        | `false`                      | `true` asks browsers not to cache the redirect                                      |
| `NUXT_CASE_SENSITIVE`           | `false`                      | `true` keeps custom short-code case (`Docs` ≠ `docs`)                               |
| `NUXT_ANALYTICS_RETENTION_DAYS` | `90`                         | Days of `access_logs` to keep; `0` or negative keeps rows forever                   |
| `NUXT_LIST_QUERY_LIMIT`         | `500`                        | Max rows in analytics lists                                                         |
| `NUXT_DISABLE_BOT_ACCESS_LOG`   | `false`                      | `true` drops detected bots from analytics and webhooks                              |
| `NUXT_DISABLE_AUTO_BACKUP`      | `false`                      | `true` turns off the daily 00:00 UTC backup job                                     |
| `NUXT_AI_BASE_URL`              | empty                        | OpenAI-compatible endpoint; AI routes answer HTTP 501 until this is set             |
| `NUXT_AI_API_KEY`               | empty                        | API key for the endpoint above; both must be set to enable AI                       |
| `NUXT_AI_MODEL`                 | `@cf/qwen/qwen3-30b-a3b-fp8` | Model name passed to the upstream provider                                          |
| `NUXT_AI_PROMPT`                | built-in                     | Custom slug prompt must keep `{slugRegex}`                                          |
| `NUXT_AI_OG_PROMPT`             | built-in                     | Custom social-preview prompt                                                        |
| `NUXT_GEOIP_DB`                 | empty                        | Optional GeoLite2-City `.mmdb` path; used when the proxy sends no `x-geo-*` headers |

See `.env.example` for the authoritative list with comments, [Analytics](/features/analytics), and [API](/api/).
