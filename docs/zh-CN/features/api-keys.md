---
title: API 密钥
description: 为站点管理员提供程序化访问——创建、授权范围、轮换与撤销 API 密钥，以及它们可以调用的端点。
---

# API 密钥

API 密钥让受信任的脚本与集成在不暴露站点令牌的前提下调用 Sink 的 REST API。在仪表盘里创建，配 `Authorization: Bearer` 头使用，随时可以撤销。

## 概述

- 在 **Dashboard → API Keys**（`/dashboard/api-keys`）按实例管理 API 密钥。
- 只有站点令牌（或已验证的 Cloudflare Access 身份）能创建、编辑、撤销或删除密钥。
- 每个密钥携带一个或多个**权限范围（scope）**，决定它可以调用哪些端点。
- 完整的密钥值仅在创建时**显示一次**。Sink 只存 SHA-256 哈希，原值无法再找回——看到时请立即复制。
- 密钥以 `sk_` 开头，便于在日志和工具中识别。

## 创建 API 密钥

打开 **Dashboard → API Keys**，点击 **Create**。填写：

1. **名称**（必填）——便于在列表里区分不同的密钥。
2. **权限范围** —— 勾选 `links:read` 和/或 `links:write`。默认两者都启用；不需要的取消即可。
3. **过期时间**（可选）—— 选择未来的某个时间点。留空表示永不过期。

提交表单。新密钥会在一次性对话框中展示完整值（`sk_...`）。现在就复制并保管到密钥管理工具里；之后仪表盘只会显示前缀、最后使用时间和元数据。

::: warning 完整密钥只显示一次
关闭对话框后，明文密钥就消失了。如果丢失，撤销该密钥并新建一个。**没有"显示"按钮**。
:::

## 权限范围

| 范围          | 授予能力                                                     |
| ------------- | ------------------------------------------------------------ |
| `links:read`  | `/api/link/*` 下的读端点（query、list、search、tags、count） |
| `links:write` | `/api/link/*` 下的写端点（create、upsert、edit、delete）     |

密钥不会被授予任何其他权限。无论勾选哪些范围，访问分析、日志、域名以及 API 密钥管理端点都仍然仅限站点令牌。

## 使用 API 密钥

把密钥作为 Bearer 令牌放在 `Authorization` 头里发送：

```bash
curl -H "Authorization: Bearer sk_YOUR_KEY" \
  "https://your-domain.com/api/link/list?limit=10"
```

确认服务端识别的身份：

```bash
curl -H "Authorization: Bearer sk_YOUR_KEY" \
  "https://your-domain.com/api/verify"
```

使用具备写权限的密钥创建一条链接：

```bash
curl -X POST \
  -H "Authorization: Bearer sk_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","slug":"docs"}' \
  "https://your-domain.com/api/link/create"
```

密钥缺少所需 scope 时返回 **403**。密钥不存在、被撤销或已过期则返回 **401**。

## 允许的端点

下列端点接受 API 密钥。列表之外的任何端点对密钥一律返回 **403**，即使请求本身合法。

| 范围          | 方法 | 端点               | 说明               |
| ------------- | ---- | ------------------ | ------------------ |
| （任意）      | GET  | `/api/verify`      | 报告当前认证身份   |
| `links:read`  | GET  | `/api/link/query`  | 按短链码取一条链接 |
| `links:read`  | GET  | `/api/link/list`   | 分页列出链接       |
| `links:read`  | GET  | `/api/link/search` | 跨字段全文搜索     |
| `links:read`  | GET  | `/api/link/count`  | 链接总数           |
| `links:read`  | GET  | `/api/link/tags`   | 聚合后的标签列表   |
| `links:write` | POST | `/api/link/create` | 创建新链接         |
| `links:write` | POST | `/api/link/upsert` | 创建或返回已存在   |
| `links:write` | PUT  | `/api/link/edit`   | 更新已有链接       |
| `links:write` | POST | `/api/link/delete` | 删除一条链接       |

其他所有端点（`/api/stats/**`、`/api/logs/**`、`/api/link/check`、`/api/link/ai`、`/api/link/og-ai`、`/api/link/import`、`/api/link/export`、`/api/link/migration/**`、`/api/upload/image`、`/api/backup`、`/api/location`、`/api/api-key/**`）都需要站点令牌。

## 管理端点

这些端点用于管理密钥本身，仅接受站点令牌（或已验证的 Cloudflare Access 身份）。API 密钥**永远不能调用它们**。

| 方法 | 端点                  | 用途                                   |
| ---- | --------------------- | -------------------------------------- |
| GET  | `/api/api-key/list`   | 列出全部密钥及元数据                   |
| POST | `/api/api-key/create` | 创建新密钥                             |
| PUT  | `/api/api-key/edit`   | 重命名、修改 scope、延长过期时间或撤销 |
| POST | `/api/api-key/revoke` | 立即撤销一个密钥                       |
| POST | `/api/api-key/delete` | 永久删除一个密钥                       |

## 安全说明

- **仅存哈希。** Sink 只存储 `SHA-256(key)` 和一个非敏感的前缀用于展示。创建后明文密钥不会留在服务端。
- **密码学随机。** 密钥通过 CSPRNG 生成，不可猜测，也与站点令牌无关。
- **常量时间比较。** 每次请求的哈希比较都是常量时间，避免时序攻击。
- **仅显示一次。** 明文仅在创建响应与仪表盘对话框里返回，没有任何 API 可以再次读取。
- **立即失效。** 撤销或删除的密钥在下次请求时就失效。已过期的密钥一旦超过 `expires_at` 即返回 **401**。
- **用量追踪。** 每次成功调用都会更新密钥的 `last_used_at`，便于在仪表盘里发现长期不用的凭据并轮换。
- **权限分离。** 只读与写权限相互独立。给分析任务发只读密钥；写 scope 只发给确实需要修改链接的工具。

## 跨域调用

其他源的浏览器应用可以在 `NUXT_API_CORS=true` 构建开关启用时，用 API 密钥调用接口。仍然需要认证——`Authorization: Bearer` 里的密钥会和任何其他请求一样被检查。见[配置参考](/zh-CN/configuration/#可选配置)。
