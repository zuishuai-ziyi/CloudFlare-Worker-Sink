---
title: 链接备份
description: 把链接快照存到 NUXT_DATA_DIR/r2/backups/、包含什么、如何计划执行，以及恢复限制。
---

# 链接备份

Sink 备份是存在 `<NUXT_DATA_DIR>/r2/backups/` 下的**链接 JSON 快照**。它不是完整数据库转储。

## 需要什么

1. 目录 `<NUXT_DATA_DIR>/r2/backups/` 可写（首次使用时会自动创建）
2. 完成一次性存储初始化：部署后打开 **Dashboard → Links**。在此之前备份会失败，并提示「存储未就绪」（HTTP 423）。见[存储初始化](/zh-CN/storage/kv-to-d1)
3. 在仪表盘或通过 `POST /api/backup` 创建快照

每日自动备份在 Node 进程中按 **UTC 00:00** 跑。可用 `NUXT_DISABLE_AUTO_BACKUP=true` 关闭。任何时候都可以通过 `POST /api/backup` 或仪表盘触发一次手动快照。

文件名：

- 自动：`backups/links-<timestamp>.json`
- 手动：`backups/manual-links-<timestamp>.json`

## 里面有什么

全部链接记录，包括过期链接和密码材料。请把每个快照当作**机密**。

::: warning 快照是敏感数据
严格限制谁能读取磁盘上的备份目录。快照可能包含密码材料和完整目标 URL。
:::

不包含：数据库结构、删除标记、迁移历史、访问分析数据。

## 恢复限制

Sink 不会自动清理旧快照，也不提供一键完整恢复。你可以从快照[导入](./import-export)记录（仍走普通导入规则）。数据库级恢复请从你自己的磁盘或文件系统备份中恢复 `NUXT_DATA_DIR` 下的 SQLite 文件。
