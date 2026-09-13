---
title: Architecture
description: How Sink handles the dashboard, API, redirects, storage, and analytics.
---

# Architecture

Sink runs the dashboard, API, and short-link redirects as a single long-lived Node.js process. On Cloudflare Pages/Workers it ran the same code through different bindings; that path is now preserved under the `cloudflare/` git submodule.

## What happens when someone opens a short link

1. A visitor opens a short link on your domain
2. Sink looks up the link and redirects (or shows a password/warning page)
3. You manage links in the dashboard or via the API (both require login)
4. Visits show up in reports and logs — analytics is built in

## Storage the Node runtime uses

The Node runtime replaces every Cloudflare binding automatically — you do not configure them:

| Cloudflare name | Node-side equivalent                                | Required? | Plain meaning                                  |
| --------------- | --------------------------------------------------- | --------- | ---------------------------------------------- |
| `DB` (D1)       | SQLite database under `<NUXT_DATA_DIR>`             | Yes       | Main database — the real home of your links    |
| `KV`            | `kv_store` table inside the same database           | Yes       | Fast cache for redirects + one-time setup flag |
| `ANALYTICS`     | `access_logs` table inside the same database        | Built in  | Visit events for charts and logs               |
| `R2`            | Files under `<NUXT_DATA_DIR>/r2/`                   | Built in  | Backups and social preview images              |
| `AI`            | Any OpenAI-compatible endpoint (`NUXT_AI_BASE_URL`) | Optional  | Suggests short codes and titles                |

The SQLite database is where links are really stored. The `kv_store` table is a fast copy used for redirects. After you save a link, Sink updates the cache; if the cache is wrong, it is dropped and reloaded from SQLite.

After the first deploy, open **Dashboard → Links** once so Sink can finish storage setup. Until then, most link APIs fail with “storage not ready” (HTTP 423). See [storage setup / migration](/storage/kv-to-d1).

AI is optional and only activates when both `NUXT_AI_BASE_URL` and `NUXT_AI_API_KEY` are set. Start with [Getting Started](./getting-started).
