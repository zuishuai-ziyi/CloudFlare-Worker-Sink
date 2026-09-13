---
title: Link Backups
description: Save link snapshots locally under NUXT_DATA_DIR/r2/backups/, what they contain, scheduling, and restore limits.
---

# Link Backups

A Sink backup is a **JSON snapshot of your links** stored locally under `<NUXT_DATA_DIR>/r2/backups/`. It is not a full database dump.

## Requirements

1. The directory `<NUXT_DATA_DIR>/r2/backups/` is writable (it is created on first use)
2. Finish one-time storage setup: open **Dashboard → Links** after deploy. Until then, backup fails with “storage not ready” (HTTP 423). See [storage setup](/storage/kv-to-d1)
3. Create a snapshot from the dashboard or `POST /api/backup`

Automatic daily backups run inside the Node process at **00:00 UTC**. Turn them off with `NUXT_DISABLE_AUTO_BACKUP=true`. You can always trigger a snapshot manually with `POST /api/backup` or the dashboard.

File names:

- Automatic: `backups/links-<timestamp>.json`
- Manual: `backups/manual-links-<timestamp>.json`

## What is inside

All link records, including expired ones and password material. Treat every snapshot as **secret**.

::: warning Snapshots are sensitive
Limit who can read the backup directory on disk. Snapshots may include password material and full destination URLs.
:::

Not included: database schema, delete markers, migration history, analytics data.

## Restore limits

Sink does not auto-delete old snapshots or offer one-click full restore. You can [import](./import-export) records from a snapshot (with normal import rules). For database-level recovery, restore the SQLite file under `NUXT_DATA_DIR` from your own disk or filesystem backups.
