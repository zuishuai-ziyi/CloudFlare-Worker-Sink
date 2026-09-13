---
title: 快速开始
description: 准备 Node 运行时、部署 Sink 并创建第一个短链接。
---

# 快速开始

Sink 是一款自托管短链接应用，带访问分析。它以单一长生命周期的 Node.js 进程（Nitro `node-server` 预设）运行；原 Cloudflare 实现保留在 `cloudflare/` git 子模块中，仅作参考。

## 1. Fork Sink

在你的 GitHub 账户中 [Fork Sink 仓库](https://github.com/miantiao-me/Sink/fork)。

## 2. 选择部署方式

- [Linux VPS](/zh-CN/deployment/vps) — 当前支持的部署方式
- [Cloudflare Workers](/zh-CN/deployment/workers) — 旧路径，代码保留在 `cloudflare/` 子模块
- [Cloudflare Pages](/zh-CN/deployment/pages) — 已废弃

Node 部署自带 SQLite 数据库和 `NUXT_DATA_DIR` 下的本地文件存储；通常用 nginx（或任意反向代理）在前面终结 TLS。

## 3. 需要准备的内容

首次启动前先确定：

| 变量               | 默认值    | 是什么                                     |
| ------------------ | --------- | ------------------------------------------ |
| `NUXT_SITE_TOKEN`  | 空        | 仪表盘登录密码与 API 密码（至少 8 个字符） |
| `PORT`             | `3000`    | Node 进程绑定的 TCP 端口                   |
| `HOST`             | `0.0.0.0` | Node 进程绑定的网络接口                    |
| `NUXT_DATA_DIR`    | `./data`  | 存放 SQLite 数据库、上传文件和备份的目录   |
| `NUXT_AI_BASE_URL` | 空        | AI 辅助用的 OpenAI 兼容端点（可选）        |
| `NUXT_AI_API_KEY`  | 空        | 上面端点的 API 密钥                        |

不需要任何外部数据库、KV 命名空间、R2 桶或 Analytics Engine 绑定 —— 本地 SQLite 数据库和 `<NUXT_DATA_DIR>/r2/` 目录会在首次使用时自动创建。AI 辅助可以稍后再加 — 见 [AI 辅助](/zh-CN/features/ai)。

## 4. 配置并部署

按 [VPS 部署指南](/zh-CN/deployment/vps) 安装 Node.js、构建 Sink、配置 systemd 并在前面放 nginx。

::: warning 请自行设置 `NUXT_SITE_TOKEN`
这是**仪表盘登录密码**，也是 API 工具使用的密码。请用足够长的随机字符串（至少 8 个字符），并保持稳定 — 改了之后所有人都会退出登录。

如果跳过，Sink 可能在启动时随机生成密码，下次重启可能变化，导致无法稳定登录。
:::

其他设置见[配置参考](/zh-CN/configuration/)。

## 5. 首次登录并创建链接

1. 打开 `https://你的域名/dashboard`
2. 用你设置的 `NUXT_SITE_TOKEN` 登录
3. 打开一次 **Dashboard → Links**

::: tip 为什么要先打开一次 Links？
第一次打开会完成一次性的存储初始化。在此之前，创建链接或备份可能失败，并提示「存储未就绪」（HTTP 423）。Node 部署上这只是快速的空检查；KV 迁移页面描述的是旧版 Cloudflare 流程 — 见[存储初始化 / 迁移](/zh-CN/storage/kv-to-d1)。
:::

4. 创建第一个短链接

仪表盘支持多语言。产品文档提供英文与简体中文。
