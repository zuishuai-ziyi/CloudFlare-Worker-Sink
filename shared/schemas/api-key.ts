import { z } from 'zod'

/** Opaque API key tokens are prefixed to distinguish them from site tokens. */
export const API_KEY_TOKEN_PREFIX = 'sk_'

export const ApiKeyScopesSchema = z.enum(['links:read', 'links:write'])
export type ApiKeyScope = z.infer<typeof ApiKeyScopesSchema>

export const ApiKeyNameSchema = z.string().trim().min(1).max(100)
export const ApiKeyIdSchema = z.string().trim().min(1).max(64)

export const CreateApiKeySchema = z.object({
  name: ApiKeyNameSchema,
  scopes: z.array(ApiKeyScopesSchema).min(1).default(['links:read', 'links:write']),
  /** Unix seconds; omitted means the key never expires. */
  expiresAt: z.number().int().positive().optional(),
})

export const EditApiKeySchema = z.object({
  id: ApiKeyIdSchema,
  name: ApiKeyNameSchema.optional(),
  scopes: z.array(ApiKeyScopesSchema).min(1).optional(),
}).refine(value => value.name !== undefined || value.scopes !== undefined, {
  message: 'At least one of name or scopes must be provided',
})

export const ApiKeyTargetSchema = z.object({ id: ApiKeyIdSchema })

/** Shape returned to the dashboard; never contains the token or its hash. */
export const StoredApiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  tokenPrefix: z.string(),
  scopes: z.array(ApiKeyScopesSchema),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  lastUsedAt: z.number().int().nullable(),
  expiresAt: z.number().int().nullable(),
  revokedAt: z.number().int().nullable(),
})
export type StoredApiKey = z.infer<typeof StoredApiKeySchema>
