---
title: API Keys
description: Programmatic access for site admins — create, scope, rotate, and revoke API Keys, plus the endpoints they can call.
---

# API Keys

API Keys let trusted scripts and integrations call Sink's REST API without using your site token. Create them in the dashboard, send them with `Authorization: Bearer`, and revoke them at any time.

## Overview

- API Keys are managed per instance from **Dashboard → API Keys** (`/dashboard/api-keys`).
- Only the site token (or a verified Cloudflare Access identity) can create, edit, revoke, or delete keys.
- Each key carries one or more **scopes** that decide which endpoints it may call.
- The full key value is shown **once** at creation time. Sink stores only a SHA-256 hash, so the original value cannot be recovered later — copy it when it appears.
- Keys are prefixed with `sk_` so they are easy to recognise in logs and tooling.

## Creating an API Key

Open **Dashboard → API Keys** and click **Create**. Fill in:

1. **Name** (required) — a human-readable label so you can tell keys apart in the list.
2. **Scopes** — tick `links:read` and/or `links:write`. Both are enabled by default; untick what you do not need.
3. **Expires at** (optional) — pick a future date and time. Leave empty for a non-expiring key.

Submit the form. The new key appears in a one-time dialog with its full value (`sk_...`). Copy it now and store it in your secret manager; the dashboard will only ever show the prefix, last-used time, and metadata.

::: warning The full key is shown once
After you close the dialog, the plaintext key is gone. If you lose it, revoke the key and create a new one. There is no "reveal" button.
:::

## Scopes

| Scope         | Grants                                                                |
| ------------- | --------------------------------------------------------------------- |
| `links:read`  | Read endpoints under `/api/link/*` (query, list, search, tags, count) |
| `links:write` | Mutating endpoints under `/api/link/*` (create, upsert, edit, delete) |

Keys are not granted any other permission. Stats, logs, domain, and the API Key admin endpoints all stay restricted to the site token regardless of scopes.

## Using an API Key

Send the key as a Bearer token in the `Authorization` header:

```bash
curl -H "Authorization: Bearer sk_YOUR_KEY" \
  "https://your-domain.com/api/link/list?limit=10"
```

Confirm the identity recognised by the server:

```bash
curl -H "Authorization: Bearer sk_YOUR_KEY" \
  "https://your-domain.com/api/verify"
```

Create a link with a write-scoped key:

```bash
curl -X POST \
  -H "Authorization: Bearer sk_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","slug":"docs"}' \
  "https://your-domain.com/api/link/create"
```

A key missing the required scope for an endpoint receives **403**. An unknown, revoked, or expired key receives **401**.

## Allowed endpoints

These endpoints accept an API Key. Anything not listed returns **403** for keys, even if the request would otherwise be valid.

| Scope         | Method | Endpoint           | Notes                              |
| ------------- | ------ | ------------------ | ---------------------------------- |
| (any)         | GET    | `/api/verify`      | Reports the authenticated identity |
| `links:read`  | GET    | `/api/link/query`  | Fetch one link by slug             |
| `links:read`  | GET    | `/api/link/list`   | Paginated list of links            |
| `links:read`  | GET    | `/api/link/search` | Full-text search across links      |
| `links:read`  | GET    | `/api/link/count`  | Total link count                   |
| `links:read`  | GET    | `/api/link/tags`   | Aggregate tag list                 |
| `links:write` | POST   | `/api/link/create` | Create a new link                  |
| `links:write` | POST   | `/api/link/upsert` | Create or return existing          |
| `links:write` | PUT    | `/api/link/edit`   | Update an existing link            |
| `links:write` | POST   | `/api/link/delete` | Delete a link                      |

All other endpoints (`/api/stats/**`, `/api/logs/**`, `/api/link/check`, `/api/link/ai`, `/api/link/og-ai`, `/api/link/import`, `/api/link/export`, `/api/link/migration/**`, `/api/upload/image`, `/api/backup`, `/api/location`, `/api/api-key/**`) require the site token.

## Admin endpoints

These manage keys themselves and accept only the site token (or a verified Cloudflare Access identity). API Keys can never call them.

| Method | Endpoint              | Purpose                                         |
| ------ | --------------------- | ----------------------------------------------- |
| GET    | `/api/api-key/list`   | List all keys with metadata                     |
| POST   | `/api/api-key/create` | Create a new key                                |
| PUT    | `/api/api-key/edit`   | Rename, change scopes, extend expiry, or revoke |
| POST   | `/api/api-key/revoke` | Revoke a key immediately                        |
| POST   | `/api/api-key/delete` | Permanently remove a key                        |

## Security notes

- **Hash-only storage.** Sink stores `SHA-256(key)` plus a non-secret prefix for display. The plaintext key never leaves your clipboard after creation.
- **Cryptographic randomness.** Keys are generated with a CSPRNG; they are unguessable and not derived from the site token.
- **Constant-time comparison.** Hash comparison on every request runs in constant time to defeat timing attacks.
- **Show once.** The plaintext is returned in the create response and in the dashboard dialog only. There is no API to read it back.
- **Immediate revocation.** Revoking or deleting a key invalidates it on the next request. Expired keys are rejected with **401** as soon as their `expires_at` passes.
- **Usage tracking.** Each successful call updates the key's `last_used_at`, so you can spot stale credentials in the dashboard and rotate them.
- **Scope separation.** Read-only and write scopes are independent. Issue a read-only key for analytics jobs; reserve write scopes for tools that actually need to mutate links.

## Cross-origin calls

Browser apps on other origins can call the API with an API Key, but only when the build-time flag `NUXT_API_CORS=true` is set. Authentication is still required — the key in `Authorization: Bearer` is checked like any other request. See [configuration](/configuration/#optional).
