<script setup lang="ts">
import type { BadgeVariants } from '@/components/ui/badge'
import { BookOpen, ExternalLink, KeyRound, ShieldCheck } from '@lucide/vue'

const { t } = useI18n()

interface EndpointRow {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  scopes: readonly ('links:read' | 'links:write')[]
  descriptionKey:
    | 'verify'
    | 'link_query'
    | 'link_list'
    | 'link_search'
    | 'link_count'
    | 'link_tags'
    | 'link_create'
    | 'link_upsert'
    | 'link_edit'
    | 'link_delete'
}

// Endpoint surface is the OPEN_API_ROUTE_SCOPES whitelist in server/utils/api-key.ts.
// Keep this list aligned with that contract so the docs do not drift.
const endpoints: readonly EndpointRow[] = [
  { method: 'GET', path: '/api/verify', scopes: [], descriptionKey: 'verify' },
  { method: 'GET', path: '/api/link/query', scopes: ['links:read'], descriptionKey: 'link_query' },
  { method: 'GET', path: '/api/link/list', scopes: ['links:read'], descriptionKey: 'link_list' },
  { method: 'GET', path: '/api/link/search', scopes: ['links:read'], descriptionKey: 'link_search' },
  { method: 'GET', path: '/api/link/count', scopes: ['links:read'], descriptionKey: 'link_count' },
  { method: 'GET', path: '/api/link/tags', scopes: ['links:read'], descriptionKey: 'link_tags' },
  { method: 'POST', path: '/api/link/create', scopes: ['links:write'], descriptionKey: 'link_create' },
  { method: 'POST', path: '/api/link/upsert', scopes: ['links:write'], descriptionKey: 'link_upsert' },
  { method: 'PUT', path: '/api/link/edit', scopes: ['links:write'], descriptionKey: 'link_edit' },
  { method: 'POST', path: '/api/link/delete', scopes: ['links:write'], descriptionKey: 'link_delete' },
]

const methodVariant: Record<EndpointRow['method'], BadgeVariants['variant']> = {
  GET: 'secondary',
  POST: 'default',
  PUT: 'default',
  DELETE: 'destructive',
}

const scopeVariant: Record<'links:read' | 'links:write', BadgeVariants['variant']> = {
  'links:read': 'secondary',
  'links:write': 'outline',
}

function scopeLabel(scope: 'links:read' | 'links:write'): string {
  if (scope === 'links:read')
    return t('api_docs.scopes.links_read')
  return t('api_docs.scopes.links_write')
}

// Two representative examples: one writer (create) and one reader (query).
// JSON payloads mirror the real contract enforced by CreateLinkSchema and the
// sanitizer used in /api/link/query. They are inlined as literal examples, not
// translated content.
const createRequestJson = `{
  "url": "https://example.com/launch",
  "domain": "s.example.com",
  "slug": "launch",
  "comment": "Q3 launch announcement",
  "expiration": 1893456000,
  "title": "Q3 Launch",
  "description": "Product launch page for Q3",
  "tags": ["campaign", "q3"]
}`

const createResponseJson = `{
  "id": "kZ1p2b3c4d",
  "slug": "launch",
  "domain": "s.example.com",
  "url": "https://example.com/launch",
  "comment": "Q3 launch announcement",
  "expiration": 1893456000,
  "title": "Q3 Launch",
  "description": "Product launch page for Q3",
  "image": "",
  "apple": "",
  "google": "",
  "cloaking": false,
  "redirectWithQuery": false,
  "password": null,
  "unsafe": false,
  "geo": {},
  "tags": ["campaign", "q3"],
  "createdAt": 1714000000,
  "updatedAt": 1714000000
}`

const queryResponseJson = `{
  "id": "kZ1p2b3c4d",
  "slug": "launch",
  "domain": "s.example.com",
  "url": "https://example.com/launch",
  "comment": "Q3 launch announcement",
  "expiration": 1893456000,
  "title": "Q3 Launch",
  "description": "Product launch page for Q3",
  "image": "",
  "apple": "",
  "google": "",
  "cloaking": false,
  "redirectWithQuery": false,
  "password": null,
  "unsafe": false,
  "geo": {},
  "tags": ["campaign", "q3"],
  "createdAt": 1714000000,
  "updatedAt": 1714000000,
  "visit": 42
}`

const curlExample = `curl https://your-domain.com/api/verify \\
  -H "Authorization: Bearer sk_your_api_key"`
</script>

<template>
  <div class="mx-auto flex w-full max-w-4xl flex-col gap-6">
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2 text-lg">
          <BookOpen class="size-4" aria-hidden="true" />
          {{ $t('nav.api_docs') }}
        </CardTitle>
        <CardDescription>{{ $t('api_docs.description') }}</CardDescription>
      </CardHeader>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="text-base">
          {{ $t('api_docs.base_url.title') }}
        </CardTitle>
        <CardDescription>{{ $t('api_docs.base_url.description') }}</CardDescription>
      </CardHeader>
      <CardContent>
        <code
          class="
            block overflow-x-auto rounded-md bg-muted px-4 py-3 font-mono
            text-xs
          "
        >{{ $t('api_docs.base_url.placeholder') }}</code>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2 text-base">
          <KeyRound class="size-4" aria-hidden="true" />
          {{ $t('api_docs.auth.title') }}
        </CardTitle>
        <CardDescription>{{ $t('api_docs.auth.description') }}</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <p class="text-sm text-muted-foreground">
          {{ $t('api_docs.auth.keys_hint') }}
        </p>
        <div>
          <p class="mb-2 text-xs font-medium text-muted-foreground">
            {{ $t('api_docs.auth.example_label') }}
          </p>
          <pre
            class="
              overflow-x-auto rounded-md bg-muted px-4 py-3 font-mono
              text-xs/relaxed
            "
          ><code>{{ curlExample }}</code></pre>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2 text-base">
          <ShieldCheck class="size-4" aria-hidden="true" />
          {{ $t('api_docs.scopes.title') }}
        </CardTitle>
        <CardDescription>{{ $t('api_docs.scopes.description') }}</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="flex flex-wrap gap-2">
          <Badge variant="secondary">
            {{ $t('api_docs.scopes.links_read') }}
          </Badge>
          <Badge variant="outline">
            {{ $t('api_docs.scopes.links_write') }}
          </Badge>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="text-base">
          {{ $t('api_docs.endpoints.title') }}
        </CardTitle>
        <CardDescription>{{ $t('api_docs.endpoints.description') }}</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead class="w-24">
                  {{ $t('api_docs.endpoints.method_label') }}
                </TableHead>
                <TableHead class="w-56">
                  <span class="sr-only">Path</span>
                </TableHead>
                <TableHead class="w-40">
                  {{ $t('api_docs.endpoints.scope_label') }}
                </TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="endpoint in endpoints" :key="`${endpoint.method}:${endpoint.path}`">
                <TableCell>
                  <Badge :variant="methodVariant[endpoint.method]">
                    {{ endpoint.method }}
                  </Badge>
                </TableCell>
                <TableCell>
                  <code class="font-mono text-xs">{{ endpoint.path }}</code>
                </TableCell>
                <TableCell>
                  <div
                    v-if="endpoint.scopes.length === 0" class="
                      text-xs text-muted-foreground
                    "
                  >
                    —
                  </div>
                  <div v-else class="flex flex-wrap gap-1">
                    <Badge
                      v-for="scope in endpoint.scopes"
                      :key="scope"
                      :variant="scopeVariant[scope]"
                    >
                      {{ scopeLabel(scope) }}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell class="text-sm text-muted-foreground">
                  {{ $t(`api_docs.endpoints.${endpoint.descriptionKey}`) }}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="text-base">
          {{ $t('api_docs.example.request_label') }} — POST /api/link/create
        </CardTitle>
      </CardHeader>
      <CardContent>
        <pre
          class="
            overflow-x-auto rounded-md bg-muted px-4 py-3 font-mono
            text-xs/relaxed
          "
        ><code>{{ createRequestJson }}</code></pre>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="text-base">
          {{ $t('api_docs.example.response_label') }} — POST /api/link/create
        </CardTitle>
      </CardHeader>
      <CardContent>
        <pre
          class="
            overflow-x-auto rounded-md bg-muted px-4 py-3 font-mono
            text-xs/relaxed
          "
        ><code>{{ createResponseJson }}</code></pre>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="text-base">
          {{ $t('api_docs.example.response_label') }} — GET /api/link/query
        </CardTitle>
      </CardHeader>
      <CardContent>
        <pre
          class="
            overflow-x-auto rounded-md bg-muted px-4 py-3 font-mono
            text-xs/relaxed
          "
        ><code>{{ queryResponseJson }}</code></pre>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2 text-base">
          <ExternalLink class="size-4" aria-hidden="true" />
          {{ $t('api_docs.interactive.title') }}
        </CardTitle>
        <CardDescription>{{ $t('api_docs.interactive.description') }}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button as-child variant="outline">
          <a href="/_docs/scalar" target="_blank" rel="noopener">
            <ExternalLink aria-hidden="true" />
            {{ $t('api_docs.interactive.open') }}
          </a>
        </Button>
      </CardContent>
    </Card>
  </div>
</template>
