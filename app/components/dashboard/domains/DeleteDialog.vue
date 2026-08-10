<script setup lang="ts">
import type { DashboardDomain } from '@/composables/domains'
import { Loader2 } from '@lucide/vue'
import { toast } from 'vue-sonner'

const props = defineProps<{
  domain: DashboardDomain | null
}>()

const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const domainsStore = useDomainsStore()
const deleting = shallowRef(false)

async function removeDomain() {
  if (!props.domain || deleting.value)
    return

  deleting.value = true
  try {
    await domainsStore.removeDomain(props.domain.name)
    open.value = false
    toast(t('domains.delete_success'))
  }
  catch (error) {
    console.error(error)
    toast.error(t('domains.delete_failed'), {
      description: error instanceof Error ? error.message : String(error),
    })
  }
  finally {
    deleting.value = false
  }
}
</script>

<template>
  <AlertDialog :open="open" @update:open="open = $event">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {{ $t('domains.dialogs.delete.title', { name: domain?.name ?? '' }) }}
        </AlertDialogTitle>
        <AlertDialogDescription>
          <template v-if="domain && domain.linkCount > 0">
            {{ $t('domains.dialogs.delete.has_links', { count: domain.linkCount }) }}
          </template>
          <template v-else>
            {{ $t('domains.dialogs.delete.description', { name: domain?.name ?? '' }) }}
          </template>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="deleting">
          {{ $t('common.cancel') }}
        </AlertDialogCancel>
        <Button
          variant="destructive"
          :disabled="deleting || Boolean(domain?.linkCount)"
          :aria-busy="deleting"
          :title="domain && domain.linkCount > 0 ? $t('domains.dialogs.delete.in_use_tip') : undefined"
          @click.prevent="removeDomain"
        >
          <Loader2 v-if="deleting" class="motion-safe:animate-spin" aria-hidden="true" />
          {{ $t('domains.dialogs.delete.action') }}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
