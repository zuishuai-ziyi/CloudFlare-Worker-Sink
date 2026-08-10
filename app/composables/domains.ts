import { defineStore } from 'pinia'

export interface DashboardDomain {
  name: string
  isDefault: boolean
  createdAt: number
  updatedAt: number
  linkCount: number
}

export const useDomainsStore = defineStore('dashboard-domains', () => {
  const domains = ref<DashboardDomain[]>([])
  const loading = shallowRef(false)
  const loaded = shallowRef(false)
  const error = shallowRef<string | null>(null)
  let requestGeneration = 0

  async function fetchDomains() {
    const generation = ++requestGeneration
    loading.value = true
    error.value = null
    try {
      const result = await useAPI<DashboardDomain[]>('/api/domain')
      if (generation !== requestGeneration)
        return
      domains.value = result
      loaded.value = true
    }
    catch (err) {
      if (generation === requestGeneration) {
        error.value = err instanceof Error ? err.message : String(err)
        throw err
      }
    }
    finally {
      if (generation === requestGeneration)
        loading.value = false
    }
  }

  // Fetch once, used by many leaf components (e.g. every link card) to resolve the
  // default domain without firing a request per card.
  async function ensureLoaded() {
    if (loaded.value || loading.value)
      return
    try {
      await fetchDomains()
    }
    catch {
      // Callers fall back to the request host when the default domain is unknown.
    }
  }

  async function createDomain(name: string) {
    await useAPI('/api/domain', { method: 'POST', body: { name } })
    await fetchDomains()
  }

  async function setDefault(name: string) {
    await useAPI(`/api/domain/${encodeURIComponent(name)}`, { method: 'PUT' })
    await fetchDomains()
  }

  async function removeDomain(name: string) {
    await useAPI(`/api/domain/${encodeURIComponent(name)}`, { method: 'DELETE' })
    await fetchDomains()
  }

  const defaultDomain = computed(() => domains.value.find(domain => domain.isDefault)?.name ?? null)

  return { domains, loading, loaded, error, defaultDomain, fetchDomains, ensureLoaded, createDomain, setDefault, removeDomain }
})
