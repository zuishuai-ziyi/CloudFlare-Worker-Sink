---
title: Analytics and Realtime
description: Turn on visit analytics, read charts and logs, understand near-realtime view, exclude bots, and export CSV.
---

# Analytics and Realtime

Analytics is built in. Every short-link visit writes a row to the local `access_logs` table inside the same SQLite database — no Cloudflare account, API token, or extra binding is required.

## Retention

Tune how long rows are kept with `NUXT_ANALYTICS_RETENTION_DAYS` (default `90`; `0` or negative keeps rows forever). Retention pruning runs inside the same daily job that creates automatic backups. See [Backups](/features/backups) and [Configuration](/configuration/#advanced-defaults).

## What you can see

Successful visits feed counters, charts, heatmaps, recent events, and locations. Filter by link, time, country, browser, OS, device, and referrer.

To hide detected bots from stats and [click webhooks](/configuration/webhooks), set `NUXT_DISABLE_BOT_ACCESS_LOG=true`.

## Near-realtime page

::: tip Not a live stream
This page does **not** use WebSocket. It refreshes about every 10 seconds and plays new events at about one per second. Pause or a hidden tab stops playback. Treat it as a live-looking overview, not a perfect event feed.
:::

## Export

Download filtered stats as CSV from the dashboard or the stats export API (slug, URL, viewers, views, referrers).

Link JSON export is separate — see [Import and Export](./import-export).
