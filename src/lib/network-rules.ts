import { normalizeWebsiteScope, matchesPageDomain } from './pattern.ts'
import type * as z from 'zod/mini'
import { NetworkRuleDraftSchema, PersistedNetworkRuleSchema } from './network-schemas.ts'
import type { NetworkMethodSchema, NetworkRuleSchema, ResolvedNetworkRuleSchema } from './network-schemas.ts'
import { displayText, isBlankTemplate, trimTemplate } from './templates.ts'
import { matchesNetworkRequest } from './network-matching.ts'
export { requestUrlKey, matchesNetworkRequest } from './network-matching.ts'
export { NETWORK_METHODS } from './network-schemas.ts'
import type { HeaderPair, PlainHeaderPair } from './types'

export type NetworkMethod = z.infer<typeof NetworkMethodSchema>
export type NetworkRule = z.infer<typeof NetworkRuleSchema>
export type NetworkRuleDraft = z.infer<typeof NetworkRuleDraftSchema>
/** A Network Rule with variables filled in, as the page interceptor uses it. */
export type ResolvedNetworkRule = z.infer<typeof ResolvedNetworkRuleSchema>

export function createNetworkRuleDraft(): NetworkRuleDraft {
  return {
    name: '', url: '*', requestUrl: '', method: 'GET', enabled: true,
    mode: 'bypass', body: '', status: 200,
    headers: [{ key: 'Content-Type', value: 'application/json' }],
  }
}

export function cleanResponseHeaders(headers: HeaderPair[]): HeaderPair[] {
  return headers.map(({ key, value }) => ({ key: trimTemplate(key), value: trimTemplate(value) }))
    .filter(({ key, value }) => !isBlankTemplate(key) || !isBlankTemplate(value))
}

export function selectNetworkRule(entries: ResolvedNetworkRule[], url: string, method: string, base?: string): ResolvedNetworkRule | undefined {
  let selected: ResolvedNetworkRule | undefined
  for (const entry of entries) {
    if (entry.enabled && matchesNetworkRequest(entry, url, method, base) && (!selected || entry.order >= selected.order)) selected = entry
  }
  return selected ? { ...selected, headers: selected.headers.map(header => ({ ...header })) } : undefined
}

export function networkRulesForPage(entries: ResolvedNetworkRule[], pageUrl: string): ResolvedNetworkRule[] {
  return entries.filter(entry => matchesPageDomain(entry.url, pageUrl))
}

export function validateNetworkRule(draft: NetworkRuleDraft): string | null {
  const result = NetworkRuleDraftSchema.safeParse(draft)
  return result.success ? null : result.error.issues[0]?.message ?? 'Invalid Network Rule.'
}

export function isJsonResponse(headers: (HeaderPair | PlainHeaderPair)[]): boolean {
  const contentType = headers.find(header => displayText(header.key).trim().toLowerCase() === 'content-type')?.value ?? ''
  return /\bjson\b/i.test(displayText(contentType))
}

export function jsonBodyWarning(draft: { body: string; headers: PlainHeaderPair[] }): string | null {
  if (!isJsonResponse(draft.headers)) return null
  try { JSON.parse(draft.body); return null } catch { return 'The body is not valid JSON. You can still save and return this text.' }
}

export function normalizeNetworkRules(input: unknown): NetworkRule[] {
  if (!Array.isArray(input)) return []
  return input.flatMap((value, index) => {
    if (!value || typeof value !== 'object') return []
    const parsed = PersistedNetworkRuleSchema.safeParse(value)
    if (!parsed.success) return []
    const item = parsed.data
    const entry: NetworkRule = {
      ...item, name: item.name.trim(), url: normalizeWebsiteScope(item.url), requestUrl: trimTemplate(item.requestUrl),
      order: item.order ?? index, headers: cleanResponseHeaders(item.headers),
    }
    // Invalid persisted entries remain editable, but can never intercept.
    if (validateNetworkRule(entry)) entry.enabled = false
    return [entry]
  }).sort((a, b) => a.order - b.order).map((entry, order) => ({ ...entry, order }))
}
