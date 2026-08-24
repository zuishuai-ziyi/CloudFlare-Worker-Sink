<script setup lang="ts">
import type { DashboardApiKey, DashboardApiKeyRotateResponse } from '@/types/api-keys'
import { Loader2 } from '@lucide/vue'
import { toast } from 'vue-sonner'

const props = defineProps<{
  apiKey: DashboardApiKey | null
}>()

const emit = defineEmits<{
  rotated: []
}>()

const { t } = useI18n()
const open = defineModel<boolean>('open', { default: false })

const rotating = shallowRef(false)
const rotated = shallowRef<DashboardApiKeyRotateResponse | null>(null)

async function rotate() {
  if (!props.apiKey || rotating.value)
    return

  rotating.value = true
  try {
    const result = await useAPI<DashboardApiKeyRotateResponse>(
      '/api/api-key/rotate',
      {
        method: 'POST',
        body: { id: props.apiKey.id },
      },
    )
    rotated.value = result
    toast(t('api_keys.rotate_success'))
  }
  catch (error) {
    console.error(error)
    toast.error(t('api_keys.rotate_failed'), {
      description: error instanceof Error ? error.message : String(error),
    })
  }
  finally {
    rotating.value = false
  }
}

function finish() {
  rotated.value = null
  open.value = false
  emit('rotated')
}

function handleOpenChange(value: boolean) {
  if (!value && rotating.value)
    return
  if (!value) {
    // Reset the result view so reopening starts at the confirmation phase.
    rotated.value = null
  }
  open.value = value
}
</script>

<template>
  <ResponsiveModal
    :open="open"
    :title="t('api_keys.dialogs.rotate.title', { name: apiKey?.name ?? '' })"
    :prevent-close="rotating"
    @update:open="handleOpenChange"
  >
    <DashboardApiKeysTokenDisplay
      v-if="rotated"
      :token="rotated.token"
      @done="finish"
    />

    <div v-else class="flex flex-col gap-4 px-1">
      <p class="text-sm text-muted-foreground">
        {{ t('api_keys.dialogs.rotate.description', { name: apiKey?.name ?? '' }) }}
      </p>
    </div>

    <template v-if="!rotated" #footer>
      <Button
        type="button"
        variant="secondary"
        class="
          w-full
          sm:w-auto
        "
        :disabled="rotating"
        @click="open = false"
      >
        {{ t('common.cancel') }}
      </Button>
      <Button
        type="button"
        variant="destructive"
        class="
          w-full
          sm:w-auto
        "
        :disabled="rotating"
        :aria-busy="rotating"
        @click.prevent="rotate"
      >
        <Loader2 v-if="rotating" class="motion-safe:animate-spin" aria-hidden="true" />
        {{ t('api_keys.dialogs.rotate.action') }}
      </Button>
    </template>
  </ResponsiveModal>
</template>
