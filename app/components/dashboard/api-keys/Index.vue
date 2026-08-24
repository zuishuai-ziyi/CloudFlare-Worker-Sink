<script setup lang="ts">
import type { DashboardApiKey, DashboardApiKeyListResponse } from '@/types/api-keys'
import {
  AlertCircle,
  Ban,
  Ellipsis,
  KeyRound,
  SquarePen,
  Trash2,
} from '@lucide/vue'

const keys = ref<DashboardApiKey[]>([])
const loading = ref(false)
const error = ref(false)

async function fetchKeys() {
  loading.value = true
  error.value = false
  try {
    const data = await useAPI<DashboardApiKeyListResponse>('/api/api-key/list')
    keys.value = data.keys
  }
  catch (err) {
    console.error(err)
    error.value = true
  }
  finally {
    loading.value = false
  }
}

onMounted(() => {
  void fetchKeys()
})

defineExpose({
  async refresh() {
    await fetchKeys()
  },
})

const { t, locale } = useI18n()

const editingKey = shallowRef<DashboardApiKey | null>(null)
const editOpen = shallowRef(false)
const revokeTarget = shallowRef<DashboardApiKey | null>(null)
const revokeOpen = shallowRef(false)
const deleteTarget = shallowRef<DashboardApiKey | null>(null)
const deleteOpen = shallowRef(false)

function openEdit(key: DashboardApiKey) {
  editingKey.value = key
  editOpen.value = true
}

function openRevoke(key: DashboardApiKey) {
  revokeTarget.value = key
  revokeOpen.value = true
}

function openDelete(key: DashboardApiKey) {
  deleteTarget.value = key
  deleteOpen.value = true
}

const now = shallowRef(Math.floor(Date.now() / 1000))

function status(key: DashboardApiKey): 'active' | 'revoked' | 'expired' {
  if (key.revokedAt !== null)
    return 'revoked'
  if (key.expiresAt !== null && key.expiresAt <= now.value)
    return 'expired'
  return 'active'
}

function statusVariant(key: DashboardApiKey): 'default' | 'secondary' | 'destructive' {
  const current = status(key)
  if (current === 'revoked' || current === 'expired')
    return 'destructive'
  return 'default'
}

function scopeLabel(scope: string): string {
  if (scope === 'links:read')
    return t('api_keys.scopes.links_read')
  if (scope === 'links:write')
    return t('api_keys.scopes.links_write')
  return scope
}

function retry() {
  void fetchKeys()
}

function handleChanged() {
  // Dialogs already emit their own success/failure toasts; just refresh the list.
  void fetchKeys()
}
</script>

<template>
  <section class="space-y-6">
    <div
      v-if="loading && keys.length === 0"
      role="status"
      aria-live="polite"
      class="overflow-hidden rounded-2xl ring-1 ring-foreground/10"
    >
      <div class="space-y-3 p-6">
        <Skeleton class="h-5 w-40" />
        <Skeleton class="h-4 w-72" />
      </div>
      <div class="space-y-2 border-t p-4">
        <Skeleton v-for="i in 4" :key="i" class="h-10 w-full" />
      </div>
      <span class="sr-only">{{ $t('dashboard.loading') }}</span>
    </div>

    <Alert
      v-else-if="error"
      variant="destructive"
      class="mx-auto max-w-xl"
    >
      <AlertCircle aria-hidden="true" />
      <AlertTitle>{{ $t('api_keys.load_failed') }}</AlertTitle>
      <AlertDescription>
        <Button variant="link" size="sm" class="text-destructive" @click="retry">
          {{ $t('common.try_again') }}
        </Button>
      </AlertDescription>
    </Alert>

    <Card v-else-if="keys.length === 0">
      <CardContent
        class="
          flex min-h-48 flex-col items-center justify-center gap-3 text-center
          text-muted-foreground
        "
      >
        <KeyRound class="size-8" aria-hidden="true" />
        <div class="space-y-1">
          <p class="text-sm font-medium text-foreground">
            {{ $t('api_keys.empty_title') }}
          </p>
          <p class="text-sm text-muted-foreground">
            {{ $t('api_keys.empty_description') }}
          </p>
        </div>
      </CardContent>
    </Card>

    <div
      v-else
      class="overflow-x-auto rounded-2xl ring-1 ring-foreground/10"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{{ $t('api_keys.table.name') }}</TableHead>
            <TableHead>{{ $t('api_keys.table.token') }}</TableHead>
            <TableHead>{{ $t('api_keys.table.scopes') }}</TableHead>
            <TableHead>{{ $t('api_keys.table.status') }}</TableHead>
            <TableHead>{{ $t('api_keys.table.created_at') }}</TableHead>
            <TableHead>{{ $t('api_keys.table.last_used_at') }}</TableHead>
            <TableHead>{{ $t('api_keys.table.expires_at') }}</TableHead>
            <TableHead class="text-right">
              <span class="sr-only">{{ $t('common.edit') }}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="key in keys" :key="key.id">
            <TableCell class="font-medium">
              {{ key.name }}
            </TableCell>
            <TableCell>
              <code class="font-mono text-xs">{{ key.tokenPrefix }}…</code>
            </TableCell>
            <TableCell>
              <div class="flex flex-wrap gap-1">
                <Badge
                  v-for="scope in key.scopes"
                  :key="scope"
                  variant="secondary"
                >
                  {{ scopeLabel(scope) }}
                </Badge>
              </div>
            </TableCell>
            <TableCell>
              <Badge :variant="statusVariant(key)">
                {{ $t(`api_keys.status.${status(key)}`) }}
              </Badge>
            </TableCell>
            <TableCell class="whitespace-nowrap text-muted-foreground">
              {{ shortDate(key.createdAt, locale) }}
            </TableCell>
            <TableCell class="whitespace-nowrap text-muted-foreground">
              <template v-if="key.lastUsedAt">
                {{ shortDate(key.lastUsedAt, locale) }}
              </template>
              <template v-else>
                {{ $t('api_keys.never_used') }}
              </template>
            </TableCell>
            <TableCell class="whitespace-nowrap text-muted-foreground">
              <template v-if="key.expiresAt">
                {{ shortDate(key.expiresAt, locale) }}
              </template>
              <template v-else>
                {{ $t('api_keys.never_expires') }}
              </template>
            </TableCell>
            <TableCell class="text-right">
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    :aria-label="`${$t('common.edit')} / ${$t('common.delete')}`"
                  >
                    <Ellipsis aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem @select="openEdit(key)">
                    <SquarePen aria-hidden="true" />
                    {{ $t('common.edit') }}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator v-if="key.revokedAt === null" />
                  <DropdownMenuItem
                    v-if="key.revokedAt === null"
                    variant="destructive"
                    @select="openRevoke(key)"
                  >
                    <Ban aria-hidden="true" />
                    {{ $t('api_keys.dialogs.revoke.action') }}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" @select="openDelete(key)">
                    <Trash2 aria-hidden="true" />
                    {{ $t('common.delete') }}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <DashboardApiKeysModal
      v-if="editingKey"
      v-model:open="editOpen"
      :api-key="editingKey"
      @changed="handleChanged"
    />
    <DashboardApiKeysRevokeDialog
      v-model:open="revokeOpen"
      :api-key="revokeTarget"
      @changed="handleChanged"
    />
    <DashboardApiKeysDeleteDialog
      v-model:open="deleteOpen"
      :api-key="deleteTarget"
      @changed="handleChanged"
    />
  </section>
</template>
