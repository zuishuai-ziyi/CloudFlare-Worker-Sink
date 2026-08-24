<script setup lang="ts">
import type { DateValue } from '@internationalized/date'
import type { DashboardApiKey, DashboardApiKeyCreateResponse } from '@/types/api-keys'
import { today } from '@internationalized/date'
import { CalendarIcon } from '@lucide/vue'
import { useForm } from '@tanstack/vue-form'
import { toast } from 'vue-sonner'
import { z } from 'zod'
import { ApiKeyNameSchema, ApiKeyScopesSchema } from '#shared/schemas/api-key'
import { cn } from '@/lib/utils'

const props = defineProps<{
  apiKey?: Partial<DashboardApiKey>
  isEdit: boolean
  formId: string
}>()

const emit = defineEmits<{
  'success': [payload: DashboardApiKeyCreateResponse | DashboardApiKey]
  'update:submitting': [value: boolean]
}>()

const { t, locale } = useI18n()

type ScopeKey = 'links:read' | 'links:write'
type ScopeState = Record<ScopeKey, boolean>

function defaultScopeState(scopes?: readonly ScopeKey[]): ScopeState {
  if (!scopes)
    return { 'links:read': true, 'links:write': true }
  return {
    'links:read': scopes.includes('links:read'),
    'links:write': scopes.includes('links:write'),
  }
}

function enabledScopes(value: ScopeState): ScopeKey[] {
  return (Object.entries(value) as Array<[ScopeKey, boolean]>)
    .filter(([, enabled]) => enabled)
    .map(([scope]) => scope)
}

const form = useForm({
  defaultValues: {
    name: props.apiKey?.name ?? '',
    scopes: defaultScopeState(props.apiKey?.scopes as ScopeKey[] | undefined),
    expiration: undefined as DateValue | undefined,
  },
  onSubmit: async ({ value }) => {
    const scopes = enabledScopes(value.scopes)
    try {
      if (props.isEdit) {
        if (!props.apiKey?.id)
          throw new Error('Missing API key id')

        const { key } = await useAPI<{ key: DashboardApiKey }>(
          '/api/api-key/edit',
          {
            method: 'PUT',
            body: {
              id: props.apiKey.id,
              name: value.name.trim(),
              scopes,
            },
          },
        )
        emit('success', key)
        toast(t('api_keys.update_success'))
      }
      else {
        const payload: { name: string, scopes: ScopeKey[], expiresAt?: number } = {
          name: value.name.trim(),
          scopes,
        }
        if (value.expiration)
          payload.expiresAt = date2unix(value.expiration, 'end')

        const result = await useAPI<DashboardApiKeyCreateResponse>(
          '/api/api-key/create',
          {
            method: 'POST',
            body: payload,
          },
        )
        emit('success', result)
        toast(t('api_keys.create_success'))
      }
    }
    catch (error) {
      console.error(error)
      toast.error(props.isEdit ? t('api_keys.update_failed') : t('api_keys.create_failed'), {
        description: error instanceof Error ? error.message : String(error),
      })
    }
  },
})

const isSubmitting = form.useStore(state => state.isSubmitting)
watch(isSubmitting, value => emit('update:submitting', value), { immediate: true })

const validateName = makeZodValidator(ApiKeyNameSchema)
function validateScopes({ value }: { value: ScopeState }) {
  const parsed = z.array(ApiKeyScopesSchema).min(1).safeParse(enabledScopes(value))
  return parsed.success ? undefined : parsed.error.issues[0]?.message
}

const datePickerOpen = ref(false)

function setScope(field: { handleChange: (value: ScopeState) => void }, key: ScopeKey, enabled: boolean) {
  const current = form.getFieldValue('scopes') as ScopeState
  field.handleChange({ ...current, [key]: enabled })
}

function formatErrors(errors: unknown[]): string[] {
  return errors
    .map((e) => {
      if (typeof e === 'string')
        return e
      if (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string')
        return e.message
      return null
    })
    .filter((m): m is string => m !== null)
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
      <FieldGroup>
        <form.Field
          v-slot="{ field }"
          name="name"
          :validators="{ onBlur: validateName, onSubmit: validateName }"
        >
          <Field :data-invalid="isInvalid(field)">
            <FieldLabel :for="`${formId}-${field.name}`">
              {{ $t('api_keys.form.name') }}
            </FieldLabel>
            <Input
              :id="`${formId}-${field.name}`"
              :name="field.name"
              :model-value="field.state.value"
              :aria-invalid="getAriaInvalid(field)"
              :placeholder="$t('api_keys.form.name_placeholder')"
              autocomplete="off"
              autocapitalize="none"
              spellcheck="false"
              @blur="field.handleBlur"
              @input="field.handleChange(($event.target as HTMLInputElement).value)"
            />
            <FieldError
              v-if="isInvalid(field)"
              :errors="formatErrors(field.state.meta.errors)"
            />
          </Field>
        </form.Field>

        <form.Field
          v-slot="{ field }"
          name="scopes"
          :validators="{ onSubmit: validateScopes }"
        >
          <Field :data-invalid="isInvalid(field)">
            <FieldLabel>{{ $t('api_keys.form.scopes') }}</FieldLabel>
            <FieldDescription>
              {{ $t('api_keys.form.scopes_description') }}
            </FieldDescription>
            <FieldGroup>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel :for="`${formId}-scope-read`">
                    {{ $t('api_keys.scopes.links_read') }}
                  </FieldLabel>
                </FieldContent>
                <Switch
                  :id="`${formId}-scope-read`"
                  :model-value="field.state.value['links:read']"
                  @update:model-value="(value: boolean) => setScope(field, 'links:read', value)"
                />
              </Field>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel :for="`${formId}-scope-write`">
                    {{ $t('api_keys.scopes.links_write') }}
                  </FieldLabel>
                </FieldContent>
                <Switch
                  :id="`${formId}-scope-write`"
                  :model-value="field.state.value['links:write']"
                  @update:model-value="(value: boolean) => setScope(field, 'links:write', value)"
                />
              </Field>
            </FieldGroup>
            <FieldError
              v-if="isInvalid(field)"
              :errors="formatErrors(field.state.meta.errors)"
            />
          </Field>
        </form.Field>

        <form.Field
          v-if="!isEdit"
          v-slot="{ field }"
          name="expiration"
        >
          <Field>
            <FieldLabel :for="`${formId}-${field.name}`">
              {{ $t('api_keys.form.expiration') }}
            </FieldLabel>
            <FieldDescription>
              {{ $t('api_keys.form.expiration_description') }}
            </FieldDescription>
            <Popover v-model:open="datePickerOpen">
              <PopoverTrigger as-child>
                <Button
                  :id="`${formId}-${field.name}`"
                  type="button"
                  variant="outline"
                  :class="cn(
                    'w-full justify-start text-left',
                    !field.state.value && 'text-muted-foreground',
                  )"
                >
                  <CalendarIcon aria-hidden="true" class="mr-2 size-4" />
                  {{
                    field.state.value
                      ? field.state.value.toDate(getTimeZone()).toLocaleDateString(locale)
                      : $t('api_keys.form.pick_date')
                  }}
                </Button>
              </PopoverTrigger>
              <PopoverContent class="w-auto p-0" align="start">
                <Calendar
                  :model-value="field.state.value"
                  :default-placeholder="today(getTimeZone())"
                  :min-value="today(getTimeZone())"
                  layout="month-and-year"
                  initial-focus
                  @update:model-value="(v: DateValue | undefined) => {
                    field.handleChange(v)
                    datePickerOpen = false
                  }"
                />
              </PopoverContent>
            </Popover>
            <Button
              v-if="field.state.value"
              type="button"
              variant="ghost"
              size="sm"
              @click="field.handleChange(undefined)"
            >
              {{ $t('api_keys.form.clear_expiration') }}
            </Button>
          </Field>
        </form.Field>
      </FieldGroup>
    </fieldset>
  </form>
</template>
