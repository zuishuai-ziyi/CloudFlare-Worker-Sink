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

const revoking = shallowRef(false)

async function revoke() {
  if (!props.apiKey || revoking.value)
    return

  revoking.value = true
  try {
    await useAPI('/api/api-key/revoke', {
      method: 'POST',
      body: { id: props.apiKey.id },
    })
    open.value = false
    emit('changed')
    toast(t('api_keys.revoke_success'))
  }
  catch (error) {
    console.error(error)
    toast.error(t('api_keys.revoke_failed'), {
      description: error instanceof Error ? error.message : String(error),
    })
  }
  finally {
    revoking.value = false
  }
}

function handleEscapeKeyDown(event: KeyboardEvent) {
  if (revoking.value)
    event.preventDefault()
}

function handleOpenChange(value: boolean) {
  if (!value && revoking.value)
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
          {{ $t('api_keys.dialogs.revoke.title', { name: apiKey?.name ?? '' }) }}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {{ $t('api_keys.dialogs.revoke.description') }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="revoking">
          {{ $t('common.cancel') }}
        </AlertDialogCancel>
        <Button
          variant="destructive"
          :disabled="revoking"
          :aria-busy="revoking"
          @click.prevent="revoke"
        >
          <Loader2 v-if="revoking" class="motion-safe:animate-spin" aria-hidden="true" />
          {{ $t('api_keys.dialogs.revoke.action') }}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
