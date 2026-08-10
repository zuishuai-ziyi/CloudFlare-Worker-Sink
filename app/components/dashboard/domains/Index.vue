<script setup lang="ts">
import type { DashboardDomain } from '@/composables/domains'
import { AlertCircle, Globe, Info, Loader2, LoaderCircle, Star, Trash2 } from '@lucide/vue'
import { toast } from 'vue-sonner'

const { t, locale } = useI18n()
const domainsStore = useDomainsStore()
const { domains, loading, error } = storeToRefs(domainsStore)

const addDialogOpen = shallowRef(false)
const deleteTarget = shallowRef<DashboardDomain | null>(null)
const deleteDialogOpen = shallowRef(false)
const setDefaultPending = shallowRef(false)

onMounted(() => {
  void domainsStore.fetchDomains().catch(() => {})
})

function openDelete(domain: DashboardDomain) {
  deleteTarget.value = domain
  deleteDialogOpen.value = true
}

async function setDefault(domain: DashboardDomain) {
  if (setDefaultPending.value)
    return

  setDefaultPending.value = true
  try {
    await domainsStore.setDefault(domain.name)
    toast(t('domains.default_success'))
  }
  catch (error) {
    console.error(error)
    toast.error(t('domains.default_failed'), {
      description: error instanceof Error ? error.message : String(error),
    })
  }
  finally {
    setDefaultPending.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <Alert class="mx-auto max-w-3xl">
      <Info aria-hidden="true" />
      <AlertTitle>{{ $t('domains.hint_title') }}</AlertTitle>
      <AlertDescription>
        {{ $t('domains.hint_description') }}
      </AlertDescription>
    </Alert>

    <Card class="mx-auto max-w-3xl">
      <CardHeader>
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{{ $t('domains.title') }}</CardTitle>
            <CardDescription>{{ $t('domains.description') }}</CardDescription>
          </div>
          <DashboardDomainsAddDialog
            v-model:open="addDialogOpen"
          />
        </div>
      </CardHeader>
      <CardContent>
        <div
          v-if="loading && domains.length === 0" class="
            py-8 text-center text-muted-foreground
          " role="status" aria-live="polite"
        >
          <LoaderCircle
            class="
              mx-auto mb-2
              motion-safe:animate-spin
            " aria-hidden="true"
          />
          <span class="sr-only">{{ $t('dashboard.loading') }}</span>
        </div>

        <div v-else-if="domains.length === 0 && !error" class="py-8 text-center">
          <Globe class="mx-auto mb-2 size-8 text-muted-foreground" aria-hidden="true" />
          <p class="text-sm text-muted-foreground">
            {{ $t('domains.empty') }}
          </p>
        </div>

        <Alert v-else-if="error" variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>{{ $t('domains.load_failed') }}</AlertTitle>
          <AlertDescription>
            <Button variant="link" size="sm" class="text-destructive" @click="domainsStore.fetchDomains()">
              {{ $t('common.try_again') }}
            </Button>
          </AlertDescription>
        </Alert>

        <div v-else class="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{{ $t('domains.table.domain') }}</TableHead>
                <TableHead class="text-right">
                  {{ $t('domains.table.links') }}
                </TableHead>
                <TableHead>{{ $t('domains.table.created') }}</TableHead>
                <TableHead class="text-right">
                  {{ $t('domains.table.actions') }}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="domain in domains" :key="domain.name">
                <TableCell>
                  <div class="flex items-center gap-2">
                    <span class="font-medium">{{ domain.name }}</span>
                    <Badge v-if="domain.isDefault" variant="secondary">
                      <Star aria-hidden="true" class="size-3.5" />
                      {{ $t('domains.default_badge') }}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell class="text-right tabular-nums">
                  {{ domain.linkCount }}
                </TableCell>
                <TableCell class="whitespace-nowrap text-muted-foreground">
                  {{ shortDate(domain.createdAt, locale) }}
                </TableCell>
                <TableCell class="text-right">
                  <div class="flex justify-end gap-1">
                    <Button
                      v-if="!domain.isDefault"
                      variant="ghost"
                      size="sm"
                      :disabled="setDefaultPending"
                      :title="$t('domains.set_default')"
                      :aria-label="$t('domains.set_default')"
                      @click="setDefault(domain)"
                    >
                      <Loader2
                        v-if="setDefaultPending" class="
                          motion-safe:animate-spin
                        " aria-hidden="true"
                      />
                      <Star v-else aria-hidden="true" class="size-4" />
                      <span
                        class="
                          hidden
                          sm:inline
                        "
                      >{{ $t('domains.set_default') }}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      class="
                        text-muted-foreground
                        hover:text-destructive
                      "
                      :title="$t('common.delete')"
                      :aria-label="$t('common.delete')"
                      @click="openDelete(domain)"
                    >
                      <Trash2 aria-hidden="true" class="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>

    <DashboardDomainsDeleteDialog
      v-model:open="deleteDialogOpen"
      :domain="deleteTarget"
    />
  </div>
</template>
