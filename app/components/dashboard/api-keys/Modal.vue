<script setup lang="ts">
import type { DashboardApiKey, DashboardApiKeyCreateResponse } from '@/types/api-keys'
import { CheckCircle, Copy, CopyCheck, Loader2, Plus } from '@lucide/vue'
import { useClipboard } from '@vueuse/core'
import { toast } from 'vue-sonner'

const props = withDefaults(defineProps<{
  apiKey?: Partial<DashboardApiKey>
}>(), {
  apiKey: () => ({}),
})

const emit = defineEmits<{
  changed: []
}>()

const { t } = useI18n()
const isEdit = !!props.apiKey.id
const open = defineModel<boolean>('open', { default: false })

const formId = `api-key-form-${useId()}`
const isSubmitting = shallowRef(false)
const created = shallowRef<DashboardApiKeyCreateResponse | null>(null)

const { copy, copied } = useClipboard({ copiedDuring: 1200 })

async function handleSuccess(payload: DashboardApiKeyCreateResponse | DashboardApiKey) {
  // Create responses carry a one-time plaintext token; we keep the modal open
  // and surface it through a dedicated review view until the user explicitly
  // closes the modal. Edits close immediately and notify the parent.
  if ('token' in payload) {
    created.value = payload
    return
  }

  open.value = false
  emit('changed')
}

function close() {
  if (isSubmitting.value)
    return
  open.value = false
}

function handleOpenChange(value: boolean) {
  if (!value && isSubmitting.value)
    return
  if (!value) {
    // Reset the one-time token view the next time the modal opens so a
    // follow-up create does not flash a stale token.
    created.value = null
  }
  open.value = value
}

function copyToken() {
  if (!created.value)
    return
  copy(created.value.token)
  toast(t('api_keys.copy_success'))
}

function finishCreate() {
  created.value = null
  open.value = false
  emit('changed')
}
</script>

<template>
  <ResponsiveModal
    :open="open"
    :title="isEdit ? t('api_keys.edit') : t('api_keys.create')"
    :prevent-close="isSubmitting"
    @update:open="handleOpenChange"
  >
    <template v-if="!isEdit" #trigger>
      <slot>
        <Button size="sm">
          <Plus aria-hidden="true" />
          {{ t('api_keys.create') }}
        </Button>
      </slot>
    </template>

    <div v-if="created" class="flex flex-col gap-4 px-1">
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
        >{{ created.token }}</code>
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
    </div>

    <DashboardApiKeysForm
      v-else
      :api-key="apiKey"
      :is-edit="isEdit"
      :form-id="formId"
      @success="handleSuccess"
      @update:submitting="isSubmitting = $event"
    />

    <template v-if="created" #footer>
      <Button
        type="button"
        class="
          w-full
          sm:w-auto
        "
        @click="finishCreate"
      >
        {{ t('api_keys.token.done') }}
      </Button>
    </template>

    <template v-else #footer>
      <Button
        type="button"
        variant="secondary"
        class="
          w-full
          sm:w-auto
        "
        :disabled="isSubmitting"
        @click="close"
      >
        {{ t('common.close') }}
      </Button>
      <Button
        type="submit"
        :form="formId"
        class="
          w-full
          sm:w-auto
        "
        :disabled="isSubmitting"
        :aria-busy="isSubmitting"
      >
        <Loader2 v-if="isSubmitting" class="motion-safe:animate-spin" aria-hidden="true" />
        {{ t('common.save') }}
      </Button>
    </template>
  </ResponsiveModal>
</template>
