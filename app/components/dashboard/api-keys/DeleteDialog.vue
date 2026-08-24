<script setup lang="ts">
import type { DashboardApiKey } from '@/types/api-keys'
import { Loader2 } from '@lucide/vue'
import { toast } from 'vue-sonner'

const props = defineProps<{
  apiKey: DashboardApiKey | null
}>()

const emit = defineEmits<{
  changed: []
}>()

const { t } = useI18n()
const open = defineModel<boolean>('open', { default: false })

const deleting = shallowRef(false)

async function remove() {
  if (!props.apiKey || deleting.value)
    return

  deleting.value = true
  try {
    await useAPI('/api/api-key/delete', {
      method: 'POST',
      body: { id: props.apiKey.id },
    })
    open.value = false
    emit('changed')
    toast(t('api_keys.delete_success'))
  }
  catch (error) {
    console.error(error)
    toast.error(t('api_keys.delete_failed'), {
      description: error instanceof Error ? error.message : String(error),
    })
  }
  finally {
    deleting.value = false
  }
}

function handleEscapeKeyDown(event: KeyboardEvent) {
  if (deleting.value)
    event.preventDefault()
}

function handleOpenChange(value: boolean) {
  if (!value && deleting.value)
    return
  open.value = value
}
</script>

<template>
  <AlertDialog :open="open" @update:open="handleOpenChange">
    <AlertDialogContent
      @escape-key-down="handleEscapeKeyDown"
    >
      <AlertDialogHeader>
        <AlertDialogTitle>
          {{ $t('api_keys.dialogs.delete.title', { name: apiKey?.name ?? '' }) }}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {{ $t('api_keys.dialogs.delete.description') }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="deleting">
          {{ $t('common.cancel') }}
        </AlertDialogCancel>
        <Button
          variant="destructive"
          :disabled="deleting"
          :aria-busy="deleting"
          @click.prevent="remove"
        >
          <Loader2 v-if="deleting" class="motion-safe:animate-spin" aria-hidden="true" />
          {{ $t('api_keys.dialogs.delete.action') }}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
