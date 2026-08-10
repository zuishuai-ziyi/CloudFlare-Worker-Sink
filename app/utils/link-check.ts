import type { DashboardQuery } from '@/utils/dashboard-query'
import { parseAnalysisQuery, serializeAnalysisQuery } from '@/utils/dashboard-query'

export function getDashboardLinkDetailLocation(slug: string, sourceQuery?: DashboardQuery, domain?: string) {
  const query = sourceQuery
    ? serializeAnalysisQuery(parseAnalysisQuery(sourceQuery, false), { slug, allowSlugs: false })
    : { slug }
  // An empty (default) domain is implicit on the detail page.
  if (domain && domain !== '')
    query.domain = domain
  return {
    path: '/dashboard/link',
    query,
  }
}

export function getDashboardLinkDetailUrl(slug: string, domain?: string): string {
  const domainParam = domain && domain !== '' ? `&domain=${encodeURIComponent(domain)}` : ''
  return `/dashboard/link?slug=${encodeURIComponent(slug)}${domainParam}`
}
