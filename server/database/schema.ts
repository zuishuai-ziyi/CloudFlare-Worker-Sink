import type { Link } from '../../shared/schemas/link'
import { sql } from 'drizzle-orm'
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const domains = sqliteTable('domains', {
  // Lowercase host (no scheme/path/port). At most one row has is_default = true.
  name: text().primaryKey(),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const links = sqliteTable('links', {
  // '' (empty string) is the sentinel for "the current default domain". New links
  // store either a concrete host or '' when the chosen domain is the default.
  domain: text().notNull().default(''),
  slug: text().notNull(),
  id: text().notNull(),
  url: text().notNull(),
  comment: text(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  expiration: integer(),
  title: text(),
  description: text(),
  image: text(),
  apple: text(),
  google: text(),
  cloaking: integer({ mode: 'boolean' }),
  redirectWithQuery: integer('redirect_with_query', { mode: 'boolean' }),
  password: text(),
  unsafe: integer({ mode: 'boolean' }),
  geo: text({ mode: 'json' }).$type<Link['geo']>(),
  normalizedUrl: text('normalized_url').notNull(),
  effectiveExpiresAt: integer('effective_expires_at'),
}, table => [
  primaryKey({ columns: [table.domain, table.slug] }),
  index('links_created_at_domain_slug_idx').on(table.createdAt, table.domain, table.slug),
  index('links_created_at_desc_domain_slug_idx').on(sql`${table.createdAt} desc`, table.domain, table.slug),
  index('links_normalized_url_idx').on(table.normalizedUrl),
  index('links_id_idx').on(table.id),
])

export const tags = sqliteTable('tags', {
  name: text().primaryKey(),
})

export const linkTags = sqliteTable('link_tags', {
  linkDomain: text('link_domain').notNull().default(''),
  linkSlug: text('link_slug').notNull(),
  tagName: text('tag_name').notNull().references(() => tags.name, { onDelete: 'cascade' }),
}, table => [
  primaryKey({ columns: [table.linkDomain, table.linkSlug, table.tagName] }),
  index('link_tags_tag_name_link_domain_link_slug_idx').on(table.tagName, table.linkDomain, table.linkSlug),
])

export const linkTombstones = sqliteTable('link_tombstones', {
  domain: text().notNull().default(''),
  slug: text().notNull(),
  deletedAt: integer('deleted_at').notNull(),
}, table => [
  primaryKey({ columns: [table.domain, table.slug] }),
])

export const linkMigrationRuns = sqliteTable('link_migration_runs', {
  id: text().primaryKey(),
  expectedCursor: text('expected_cursor'),
  scanned: integer().notNull().default(0),
  inserted: integer().notNull().default(0),
  skipped: integer().notNull().default(0),
  expired: integer().notNull().default(0),
  force: integer({ mode: 'boolean' }).notNull(),
  status: text({ enum: ['running', 'completed'] }).notNull().default('running'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, table => [
  index('link_migration_runs_status_updated_at_desc_created_at_desc_id_desc_idx').on(
    table.status,
    sql`${table.updatedAt} desc`,
    sql`${table.createdAt} desc`,
    sql`${table.id} desc`,
  ),
])

export const apiKeys = sqliteTable('api_keys', {
  id: text().primaryKey(),
  name: text().notNull(),
  tokenHash: text('token_hash').notNull(),
  tokenPrefix: text('token_prefix').notNull(),
  scopes: text({ mode: 'json' }).$type<string[]>().notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  lastUsedAt: integer('last_used_at'),
  expiresAt: integer('expires_at'),
  revokedAt: integer('revoked_at'),
}, table => [
  index('api_keys_token_hash_idx').on(table.tokenHash),
])
