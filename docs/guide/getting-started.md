---
title: Getting Started
description: Prepare the Node runtime, deploy Sink, and create your first short link.
---

# Getting Started

Sink is a self-hosted short-link app with visit analytics. It runs as a single long-lived Node.js process (Nitro `node-server` preset); the original Cloudflare implementation is preserved under the `cloudflare/` git submodule for reference.

## 1. Fork Sink

Create a [fork of the Sink repository](https://github.com/miantiao-me/Sink/fork) in your GitHub account.

## 2. Choose where to deploy

- [Linux VPS](/deployment/vps) — the supported deployment
- [Cloudflare Workers](/deployment/workers) — legacy path, code kept in the `cloudflare/` submodule
- [Cloudflare Pages](/deployment/pages) — deprecated

The Node deployment owns its own SQLite database and local file storage under `NUXT_DATA_DIR`; nginx (or any reverse proxy) terminates TLS in front of it.

## 3. What you need to prepare

Before the first start, decide on:

| Variable           | Default   | What it is                                            |
| ------------------ | --------- | ----------------------------------------------------- |
| `NUXT_SITE_TOKEN`  | empty     | Dashboard login password and API password (≥ 8 chars) |
| `PORT`             | `3000`    | TCP port the Node process binds                       |
| `HOST`             | `0.0.0.0` | Interface the Node process binds                      |
| `NUXT_DATA_DIR`    | `./data`  | Directory for the SQLite DB, uploads, and backups     |
| `NUXT_AI_BASE_URL` | empty     | OpenAI-compatible endpoint for AI helpers (optional)  |
| `NUXT_AI_API_KEY`  | empty     | API key for that endpoint                             |

No external database, KV namespace, R2 bucket, or Analytics Engine binding is required — Sink creates the local SQLite database and the `<NUXT_DATA_DIR>/r2/` directory on first use. You can add AI helpers later — see [AI helpers](/features/ai).

## 4. Configure and deploy

Follow the [VPS deployment guide](/deployment/vps) to install Node.js, build Sink, configure systemd, and put nginx in front.

::: warning Set `NUXT_SITE_TOKEN` yourself
This is your **dashboard login password** and the password used by API tools. Use a long random string (at least 8 characters) and keep it stable — changing it signs everyone out.

If you skip it, Sink may invent a random password at boot that can change on the next restart, and you will not be able to log in reliably.
:::

Other settings: [configuration reference](/configuration/).

## 5. First login and first link

1. Open `https://your-domain/dashboard`
2. Sign in with the `NUXT_SITE_TOKEN` you set
3. Open **Dashboard → Links** once

::: tip Why open Links once?
The first open finishes a one-time storage setup. Until then, creating links or backups may fail with “storage not ready” (HTTP 423). On the Node deployment this is just a quick empty check; the legacy KV migration page documents the older Cloudflare-only flow — see [storage setup / migration](/storage/kv-to-d1).
:::

4. Create your first short link

The dashboard supports multiple languages. Docs are available in English and Simplified Chinese.
