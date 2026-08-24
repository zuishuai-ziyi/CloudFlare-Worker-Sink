<script setup lang="ts">
import { ExternalLink } from '@lucide/vue'

definePageMeta({
  layout: 'dashboard',
})
</script>

<template>
  <main class="space-y-6">
    <h1 class="sr-only">
      {{ $t('nav.api_docs') }}
    </h1>
    <Teleport to="#dashboard-header-actions" defer>
      <Button as-child variant="outline" size="sm">
        <a href="/_docs/scalar" target="_blank" rel="noopener">
          <ExternalLink aria-hidden="true" />
          {{ $t('api_docs.interactive.open') }}
        </a>
      </Button>
    </Teleport>
    <DashboardApiDocs />
  </main>
</template>
