import { getDomainPattern, matchesPageDomain } from './pattern.ts'
import type * as z from 'zod/mini'
import { NetworkOverrideDraftSchema, PersistedNetworkOverrideSchema } from './network-schemas.ts'
import type { NetworkMethodSchema, NetworkOverrideSchema } from './network-schemas.ts'
import { matchesNetworkRequest } from './network-matching.ts'
export { requestUrlKey, matchesNetworkRequest } from './network-matching.ts'
export { NETWORK_METHODS } from './network-schemas.ts'
import type { HeaderPair } from './types'

export type NetworkMethod = z.infer<typeof NetworkMethodSchema>
export type NetworkOverride = z.infer<typeof NetworkOverrideSchema>
export type NetworkOverrideDraft = z.infer<typeof NetworkOverrideDraftSchema>

export function createNetworkOverrideDraft(): NetworkOverrideDraft {
  return {
    name: '', url: '*', requestUrl: '', method: 'GET', enabled: true,
    mode: 'bypass', body: '', status: 200,
    headers: [{ key: 'Content-Type', value: 'application/json' }],
  }
}

export function cleanResponseHeaders(headers: HeaderPair[]): HeaderPair[] {
  return headers.map(({ key, value }) => ({ key: key.trim(), value: value.trim() }))
    .filter(({ key, value }) => key || value)
}

export function selectNetworkOverride(entries: NetworkOverride[], url: string, method: string, base?: string): NetworkOverride | undefined {
  let selected: NetworkOverride | undefined
  for (const entry of entries) {
    if (entry.enabled && matchesNetworkRequest(entry, url, method, base) && (!selected || entry.order >= selected.order)) selected = entry
  }
  return selected ? { ...selected, headers: selected.headers.map(header => ({ ...header })) } : undefined
}

export function networkOverridesForPage(entries: NetworkOverride[], pageUrl: string): NetworkOverride[] {
  return entries.filter(entry => matchesPageDomain(entry.url, pageUrl))
}

export function validateNetworkOverride(draft: NetworkOverrideDraft): string | null {
  const result = NetworkOverrideDraftSchema.safeParse(draft)
  return result.success ? null : result.error.issues[0]?.message ?? 'Invalid override.'
}

export function jsonBodyWarning(draft: Pick<NetworkOverrideDraft, 'body' | 'headers'>): string | null {
  const contentType = draft.headers.find(header => header.key.trim().toLowerCase() === 'content-type')?.value ?? ''
  if (!/\bjson\b/i.test(contentType)) return null
  try { JSON.parse(draft.body); return null } catch { return 'The body is not valid JSON. You can still save and return this text.' }
}

export function normalizeNetworkOverrides(input: unknown): NetworkOverride[] {
  if (!Array.isArray(input)) return []
  return input.flatMap((value, index) => {
    if (!value || typeof value !== 'object') return []
    const item = PersistedNetworkOverrideSchema.parse(value)
    const entry: NetworkOverride = {
      ...item, name: item.name.trim(), url: getDomainPattern(item.url), requestUrl: item.requestUrl.trim(),
      order: item.order ?? index, headers: cleanResponseHeaders(item.headers),
    }
    // Invalid persisted entries remain editable, but can never intercept.
    if (validateNetworkOverride(entry)) entry.enabled = false
    return [entry]
  }).sort((a, b) => a.order - b.order).map((entry, order) => ({ ...entry, order }))
}
