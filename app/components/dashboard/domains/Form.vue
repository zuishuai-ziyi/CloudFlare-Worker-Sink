<script setup lang="ts">
import { useForm } from '@tanstack/vue-form'
import { toast } from 'vue-sonner'
import { DomainSchema } from '#shared/schemas/domain'

defineProps<{
  formId: string
}>()

const emit = defineEmits<{
  'success': [name: string]
  'update:submitting': [value: boolean]
}>()

const { t } = useI18n()
const domainsStore = useDomainsStore()

const form = useForm({
  defaultValues: {
    name: '',
  },
  onSubmit: async ({ value }) => {
    try {
      await domainsStore.createDomain(value.name)
      emit('success', value.name)
      toast(t('domains.create_success'))
    }
    catch (error) {
      console.error(error)
      toast.error(t('domains.create_failed'), {
        description: error instanceof Error ? error.message : String(error),
      })
    }
  },
})

const isSubmitting = form.useStore(state => state.isSubmitting)
watch(isSubmitting, value => emit('update:submitting', value), { immediate: true })

const validateName = makeZodValidator(DomainSchema)

function formatErrors(errors: unknown[]): string[] {
  return errors
    .map((error) => {
      if (typeof error === 'string')
        return error
      if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string')
        return error.message
      return null
    })
    .filter((message): message is string => message !== null)
}
</script>

<template>
  <form
    :id="formId"
    class="w-full space-y-6 px-1"
    :aria-busy="isSubmitting"
    @submit.prevent="form.handleSubmit()"
  >
    <fieldset :disabled="isSubmitting" class="space-y-6">
      <form.Field
        v-slot="{ field }"
        name="name"
        :validators="{ onBlur: validateName, onSubmit: validateName }"
      >
        <Field :data-invalid="isInvalid(field)">
          <FieldLabel :for="`${formId}-${field.name}`">
            {{ $t('domains.form.name_label') }}
          </FieldLabel>
          <Input
            :id="`${formId}-${field.name}`"
            :name="field.name"
            :model-value="field.state.value"
            :aria-invalid="getAriaInvalid(field)"
            :placeholder="$t('domains.form.name_placeholder')"
            autocomplete="off"
            autocapitalize="none"
            spellcheck="false"
            @blur="field.handleBlur"
            @input="field.handleChange(($event.target as HTMLInputElement).value)"
          />
          <FieldDescription>
            {{ $t('domains.form.name_description') }}
          </FieldDescription>
          <FieldError
            v-if="isInvalid(field)"
            :errors="formatErrors(field.state.meta.errors)"
          />
        </Field>
      </form.Field>
    </fieldset>
  </form>
</template>
