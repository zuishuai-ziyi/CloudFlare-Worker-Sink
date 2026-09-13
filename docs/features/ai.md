---
title: AI helpers
description: Optional AI help for short-code suggestions and social preview text, via any OpenAI-compatible HTTP endpoint.
---

# AI helpers

Sink can call any **OpenAI-compatible** HTTP endpoint to suggest short codes and social preview titles/descriptions. Optional — normal links work without it.

## Enable

Set both endpoints in `.env` (or your process environment):

| Variable            | Purpose                                                                           |
| ------------------- | --------------------------------------------------------------------------------- |
| `NUXT_AI_BASE_URL`  | OpenAI-compatible endpoint (for example `https://api.openai.com/v1`)              |
| `NUXT_AI_API_KEY`   | API key for that endpoint                                                         |
| `NUXT_AI_MODEL`     | Model name passed to the upstream provider (default `@cf/qwen/qwen3-30b-a3b-fp8`) |
| `NUXT_AI_PROMPT`    | Optional custom slug prompt; must keep the `{slugRegex}` placeholder              |
| `NUXT_AI_OG_PROMPT` | Optional custom social-preview prompt                                             |

If `NUXT_AI_BASE_URL` or `NUXT_AI_API_KEY` is missing, AI endpoints return **501** ("not enabled"). See [Configuration](/configuration/#advanced-defaults) for the full list.

## Behavior

For a URL, Sink tries to read the page and ask the model for structured output:

- `/api/link/ai` — short-code suggestion
- `/api/link/og-ai` — title and description; optional `locale` query for preferred language

If the model fails after the request starts, Sink falls back to a simple URL-based suggestion. Always review before saving.

::: warning Data is sent to the configured AI provider
Page content and the destination URL may be sent to the endpoint configured by `NUXT_AI_BASE_URL`. Treat that URL as your data destination — confirm sensitivity and policy before enabling.
:::
