---
title: 访问分析与近实时视图
description: 启用访问分析、查看图表和日志、了解近实时视图、排除机器人并导出 CSV。
---

# 访问分析与近实时视图

访问分析是内建功能。每一次短链访问都会写入同一 SQLite 数据库中的本地 `access_logs` 表 —— 无需 Cloudflare 账户、API 令牌或额外绑定。

## 保留时长

用 `NUXT_ANALYTICS_RETENTION_DAYS` 调整保留天数（默认 `90`；`0` 或负数表示永久保留）。保留期清理与每日自动备份任务在同一次调度里执行。详见[备份](/zh-CN/features/backups)和[配置参考](/zh-CN/configuration/#高级默认值)。

## 能看到什么

成功的访问会进入计数器、图表、热力图、最近事件和位置。可按链接、时间、国家/地区、浏览器、系统、设备、来源筛选。

要从统计和[点击 Webhook](/zh-CN/configuration/webhooks) 排除机器人，设置 `NUXT_DISABLE_BOT_ACCESS_LOG=true`。

## 近实时页面

::: tip 不是真正的实时流
这个页面**不用** WebSocket。大约每 10 秒刷新一次，并以大约每秒 1 个事件回放。暂停或标签页隐藏会停止回放。请当作“看起来像实时”的概览，而不是完整事件流。
:::

## 导出

可在仪表盘或统计导出 API 下载筛选后的 CSV（短链码、URL、访客、访问量、来源等）。

链接 JSON 导出是另一项功能 — 见[导入/导出](./import-export)。
