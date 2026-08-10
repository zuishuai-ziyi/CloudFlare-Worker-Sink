<script setup lang="ts">
import { Loader2, Plus } from '@lucide/vue'

const emit = defineEmits<{
  success: [name: string]
}>()

const open = defineModel<boolean>('open', { default: false })

const isSubmitting = shallowRef(false)
const formId = `domain-form-${useId()}`

function handleSuccess(name: string) {
  open.value = false
  emit('success', name)
}
</script>

<template>
  <ResponsiveModal
    v-model:open="open"
    :title="$t('domains.add_title')"
    :prevent-close="isSubmitting"
  >
    <template #trigger>
      <slot>
        <Button size="sm">
          <Plus aria-hidden="true" />
          {{ $t('domains.add_action') }}
        </Button>
      </slot>
    </template>

    <DashboardDomainsForm
      :form-id="formId"
      @success="handleSuccess"
      @update:submitting="isSubmitting = $event"
    />

    <template #footer>
      <Button
        type="button"
        variant="secondary"
        :disabled="isSubmitting"
        @click="open = false"
      >
        {{ $t('common.cancel') }}
      </Button>
      <Button
        type="submit"
        :form="formId"
        :disabled="isSubmitting"
        :aria-busy="isSubmitting"
      >
        <Loader2 v-if="isSubmitting" class="motion-safe:animate-spin" aria-hidden="true" />
        {{ $t('common.save') }}
      </Button>
    </template>
  </ResponsiveModal>
</template>
