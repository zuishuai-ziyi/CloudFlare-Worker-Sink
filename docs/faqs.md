---
title: Troubleshooting
description: Fix common deploy, login, analytics, redirect, import, backup, and feature problems.
---

# Troubleshooting

## I cannot create or open short links

1. Confirm D1 and KV are bound with the exact names `DB` and `KV`
2. Redeploy the latest `master` branch
3. Open **Dashboard → Links** once (one-time storage setup)

If you see **“storage not ready” (HTTP 423)**, step 3 is missing. New installs only need that one open. Very old KV-only installs need [storage migration](/storage/kv-to-d1).

<details>
  <summary><b>KV binding screenshot</b></summary>
  <img alt="KV binding settings in Cloudflare" src="./images/faqs-kv.png">
</details>

## I cannot sign in or call the API

The password must match `NUXT_SITE_TOKEN` exactly (no extra spaces). Use at least 8 characters. If you never set the token, a random build-time password may have been used — set an explicit secret and redeploy.

If you use Cloudflare Access:

- Both `NUXT_CF_ACCESS_TEAM_DOMAIN` and `NUXT_CF_ACCESS_AUD` are set
- The AUD value is from this Access application
- The Access cookie can reach `/api` (do not limit Cookie Path to `/dashboard` only)

## Analytics is empty

Analytics is built in and writes to a local `access_logs` table inside the same SQLite database. If charts and logs are empty:

1. The database file under `NUXT_DATA_DIR` is writable and not full
2. Bot filtering or dashboard filters are not hiding the traffic
3. `NUXT_ANALYTICS_RETENTION_DAYS` has not pruned the rows you are looking at (default `90` days)

Full steps: [Analytics](/features/analytics).

## Realtime events arrive in bursts or feel delayed

Expected. The page refreshes about every 10 seconds and plays events at about one per second. It is not a live WebSocket stream. Also check that the view is not paused and the tab is visible.

## Custom short codes lose uppercase letters

Set `NUXT_CASE_SENSITIVE=true` and redeploy. This only affects **custom** codes; auto-generated codes stay lowercase. Existing codes are not renamed.

## Cloaked page is blank or refuses to load

The target site likely blocks embedding. Turn off cloaking, or change the target site if you control it. OAuth and payment pages usually refuse embedding.

## Safe browsing did not change the unsafe flag

Auto-check runs only when create/edit leaves `unsafe` unset. An explicit `true` or `false` always wins. If the DNS check fails, Sink allows the link.

## Import skips or rejects records

- Active short-code conflicts are skipped
- Invalid records fail validation
- Expired records are allowed on purpose

Keep each request within half the export page size. Use protected passwords from export — not the masked placeholders in the dashboard UI.

## Backup was not created

1. The directory `<NUXT_DATA_DIR>/r2/backups/` is writable
2. Open **Dashboard → Links** once if storage is not ready yet (backup returns 423 until then)
3. Scheduled daily backups: confirm `NUXT_DISABLE_AUTO_BACKUP` is not set to `true`; the Node server runs them at 00:00 UTC
4. Manual backups: call `POST /api/backup` (or use the dashboard backup button) at any time

## Redirect still looks old

Browser, CDN, or KV cache can delay what you see. Check `NUXT_LINK_CACHE_TTL` and `NUXT_REDIRECT_NO_STORE` in [configuration](/configuration/#advanced-defaults), then confirm the link in the dashboard.

Unknown short codes (`NUXT_NOT_FOUND_REDIRECT`) always use **302**, even when normal redirects use `301`.
