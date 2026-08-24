<script setup lang="ts">
definePageMeta({
  layout: 'dashboard',
})

const keysRef = useTemplateRef<{ refresh: () => Promise<void> }>('keysRef')

async function refreshKeys() {
  await keysRef.value?.refresh()
}
</script>

<template>
  <main class="space-y-6">
    <h1 class="sr-only">
      {{ $t('api_keys.group_title') }}
    </h1>
    <Teleport to="#dashboard-header-actions" defer>
      <DashboardApiKeysModal @changed="refreshKeys" />
    </Teleport>
    <DashboardApiKeys ref="keysRef" />
  </main>
</template>
