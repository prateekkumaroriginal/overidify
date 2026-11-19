import { normalizeWebsiteScope, matchesPageDomain } from './pattern.ts'
import type { WebsiteScope } from './pattern.ts'
import type * as z from 'zod/mini'
import { NetworkRuleDraftSchema, PersistedNetworkRuleSchema } from './network-schemas.ts'
import type { NetworkMethodSchema, NetworkRuleSchema } from './network-schemas.ts'
import { matchesNetworkRequest } from './network-matching.ts'
import { isBlank } from './schema-fields.ts'
import { displayText, hasReferences, trimTemplateEdges } from './templates.ts'
export { requestUrlKey, matchesNetworkRequest } from './network-matching.ts'
export { NETWORK_METHODS } from './network-schemas.ts'
import type { HeaderPair, ResolvedHeaderPair } from './types'

export type NetworkMethod = z.infer<typeof NetworkMethodSchema>
export type NetworkRule = z.infer<typeof NetworkRuleSchema>
export type NetworkRuleDraft = z.infer<typeof NetworkRuleDraftSchema>
// Concrete settings after variables are filled in, as the page interceptor uses them.
export type ResolvedNetworkRule = Omit<NetworkRule, 'name' | 'url' | 'requestUrl' | 'body' | 'headers'> & {
  name: string; url: WebsiteScope; requestUrl: string; body: string; headers: ResolvedHeaderPair[]
}

export function createNetworkRuleDraft(): NetworkRuleDraft {
  return {
    name: '', url: '*', requestUrl: '', method: 'GET', enabled: true,
    mode: 'bypass', body: '', status: 200,
    headers: [{ key: 'Content-Type', value: 'application/json' }],
  }
}

export function cleanResponseHeaders(headers: HeaderPair[]): HeaderPair[] {
  return headers.map(({ key, value }) => ({ key: trimTemplateEdges(key), value: trimTemplateEdges(value) }))
    .filter(({ key, value }) => !isBlank(key) || !isBlank(value))
}

type Selectable = { enabled: boolean; order: number; requestUrl: string; method: string; headers: ResolvedHeaderPair[] }
export function selectNetworkRule<Rule extends Selectable>(entries: Rule[], url: string, method: string, base?: string): Rule | undefined {
  let selected: Rule | undefined
  for (const entry of entries) {
    if (entry.enabled && matchesNetworkRequest(entry, url, method, base) && (!selected || entry.order >= selected.order)) selected = entry
  }
  // Avoid page-replaceable globals: this also runs in the website's MAIN world.
  return selected ? { ...selected, headers: selected.headers.map(header => ({ ...header })) } : undefined
}

export function networkRulesForPage<Rule extends { url: WebsiteScope }>(entries: Rule[], pageUrl: string): Rule[] {
  return entries.filter(entry => matchesPageDomain(entry.url, pageUrl))
}

export function validateNetworkRule(draft: NetworkRuleDraft): string | null {
  const result = NetworkRuleDraftSchema.safeParse(draft)
  return result.success ? null : result.error.issues[0]?.message ?? 'Invalid Network Rule.'
}

export function isJsonResponse(headers: { key: string; value: string }[]): boolean {
  const contentType = headers.find(header => header.key.trim().toLowerCase() === 'content-type')?.value ?? ''
  return /\bjson\b/i.test(contentType)
}

export function jsonBodyWarning(draft: { body: string; headers: ResolvedHeaderPair[] }): string | null {
  if (!isJsonResponse(draft.headers)) return null
  try { JSON.parse(draft.body); return null } catch { return 'The body is not valid JSON. You can still save and return this text.' }
}

/** Header list for display-only checks, such as whether the editor offers JSON features. */
export function displayHeaders(headers: HeaderPair[]): ResolvedHeaderPair[] {
  return headers.map(header => ({ key: displayText(header.key), value: hasReferences(header.value) ? '' : displayText(header.value) }))
}

export function normalizeNetworkRules(input: unknown): NetworkRule[] {
  if (!Array.isArray(input)) return []
  return input.flatMap((value, index) => {
    if (!value || typeof value !== 'object') return []
    const parsed = PersistedNetworkRuleSchema.safeParse(value)
    if (!parsed.success) return []
    const item = parsed.data
    const entry: NetworkRule = {
      ...item, name: trimTemplateEdges(item.name), url: normalizeWebsiteScope(item.url), requestUrl: trimTemplateEdges(item.requestUrl),
      order: item.order ?? index, headers: cleanResponseHeaders(item.headers),
    }
    // Invalid persisted entries remain editable, but can never intercept.
    // Variable problems are not structural, so they never disable a rule.
    if (validateNetworkRule(entry)) entry.enabled = false
    return [entry]
  }).sort((a, b) => a.order - b.order).map((entry, order) => ({ ...entry, order }))
}
