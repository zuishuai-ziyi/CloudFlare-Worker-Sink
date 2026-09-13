---
title: AI 辅助
description: 可选的 AI 帮助：通过任意 OpenAI 兼容的 HTTP 端点建议短链码和社交预览文案。
---

# AI 辅助

Sink 可以调用任意 **OpenAI 兼容**的 HTTP 端点来建议短链码和社交预览标题/描述。可选 — 不用 AI 也能正常创建链接。

## 启用

在 `.env`（或进程环境）里同时配置：

| 变量                | 用途                                                        |
| ------------------- | ----------------------------------------------------------- |
| `NUXT_AI_BASE_URL`  | OpenAI 兼容端点（例如 `https://api.openai.com/v1`）         |
| `NUXT_AI_API_KEY`   | 上面端点的 API 密钥                                         |
| `NUXT_AI_MODEL`     | 传给上游提供方的模型名（默认 `@cf/qwen/qwen3-30b-a3b-fp8`） |
| `NUXT_AI_PROMPT`    | 可选自定义短链提示词；必须保留 `{slugRegex}` 占位符         |
| `NUXT_AI_OG_PROMPT` | 可选自定义社交预览提示词                                    |

只要 `NUXT_AI_BASE_URL` 或 `NUXT_AI_API_KEY` 缺失，相关接口就会返回 **501**（未启用）。完整列表见[配置参考](/zh-CN/configuration/#高级默认值)。

## 行为

对于一个 URL，Sink 会尽量读取页面内容，并让模型返回结构化结果：

- `/api/link/ai` — 短链码建议
- `/api/link/og-ai` — 标题与描述；可用 `locale` 查询参数指定语言

模型失败时，Sink 会回退到基于 URL 的简单建议。保存前请人工检查。

::: warning 数据会发送到配置的 AI 提供方
页面内容和目标 URL 可能会发送到 `NUXT_AI_BASE_URL` 配置的端点。请把该 URL 视作你的数据出口 — 启用前请确认敏感性和策略。
:::
