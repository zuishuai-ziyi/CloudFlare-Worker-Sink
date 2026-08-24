import type { ApiKeyScope, StoredApiKey } from '#shared/schemas/api-key'

export type { ApiKeyScope }

export type DashboardApiKey = StoredApiKey

export interface DashboardApiKeyListResponse {
  keys: DashboardApiKey[]
}

export interface DashboardApiKeyCreateResponse {
  key: DashboardApiKey
  token: string
}
