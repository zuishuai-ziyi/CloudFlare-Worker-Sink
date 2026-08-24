<script setup lang="ts">
import { CheckCircle, Copy, CopyCheck } from '@lucide/vue'
import { useClipboard } from '@vueuse/core'
import { toast } from 'vue-sonner'

const props = defineProps<{
  token: string
}>()

const emit = defineEmits<{
  done: []
}>()

const { t } = useI18n()
const { copy, copied } = useClipboard({ copiedDuring: 1200 })

function copyToken() {
  copy(props.token)
  toast(t('api_keys.copy_success'))
}

function finish() {
  emit('done')
}
</script>

<template>
  <div class="flex flex-col gap-4 px-1">
    <div class="flex items-start gap-3">
      <CheckCircle aria-hidden="true" class="size-6 text-primary" />
      <div class="space-y-1">
        <p class="font-medium">
          {{ t('api_keys.token.title') }}
        </p>
        <p class="text-sm text-muted-foreground">
          {{ t('api_keys.token.description') }}
        </p>
      </div>
    </div>
    <Alert variant="default">
      <AlertDescription>
        {{ t('api_keys.token.warning') }}
      </AlertDescription>
    </Alert>
    <div class="flex items-center gap-2">
      <code
        class="
          flex-1 rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs
          break-all
        "
      >{{ token }}</code>
      <Button
        type="button"
        variant="outline"
        size="sm"
        :aria-label="copied ? t('api_keys.token.copied') : t('api_keys.token.copy')"
        @click="copyToken"
      >
        <CopyCheck v-if="copied" aria-hidden="true" class="size-4" />
        <Copy v-else aria-hidden="true" class="size-4" />
        {{ copied ? t('api_keys.token.copied') : t('api_keys.token.copy') }}
      </Button>
    </div>
    <div
      class="
        flex
        sm:justify-end
      "
    >
      <Button
        type="button"
        class="
          w-full
          sm:w-auto
        "
        @click="finish"
      >
        {{ t('api_keys.token.done') }}
      </Button>
    </div>
  </div>
</template>
