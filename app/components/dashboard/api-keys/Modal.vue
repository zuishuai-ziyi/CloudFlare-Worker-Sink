<script setup lang="ts">
import type { DashboardApiKey, DashboardApiKeyCreateResponse } from '@/types/api-keys'
import { Loader2, Plus } from '@lucide/vue'

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

    <DashboardApiKeysTokenDisplay
      v-if="created"
      :token="created.token"
      @done="finishCreate"
    />

    <DashboardApiKeysForm
      v-else
      :api-key="apiKey"
      :is-edit="isEdit"
      :form-id="formId"
      @success="handleSuccess"
      @update:submitting="isSubmitting = $event"
    />

    <template v-if="!created" #footer>
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
