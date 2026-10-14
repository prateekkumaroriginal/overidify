import { getDomainPattern, isValidDomainPattern, matchesPageDomain } from './pattern.ts'
import type { HeaderPair } from './types'

export const NETWORK_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'ANY'] as const
export type NetworkMethod = typeof NETWORK_METHODS[number]
export type NetworkOverride = {
  id: string
  name: string
  url: string
  requestUrl: string
  method: NetworkMethod
  enabled: boolean
  order: number
  mode: 'bypass' | 'call-server'
  body: string
  status: number
  headers: HeaderPair[]
}
export type NetworkOverrideDraft = Omit<NetworkOverride, 'id' | 'order'>

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

// Compare parsed URLs, including repeated query keys, without sorting values
// out of their keys or treating a changed/extra parameter as a match.
export function requestUrlKey(input: string, base?: string): string | null {
  try {
    const url = new URL(input, base)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    const pairs = [...url.searchParams].sort(([ak, av], [bk, bv]) =>
      ak < bk ? -1 : ak > bk ? 1 : av < bv ? -1 : av > bv ? 1 : 0)
    return JSON.stringify([url.origin, url.pathname, pairs])
  } catch { return null }
}

export function matchesNetworkRequest(override: NetworkOverride, input: string, method: string, base?: string): boolean {
  const key = requestUrlKey(input, base)
  return key !== null && requestUrlKey(override.requestUrl) === key &&
    (override.method === 'ANY' || override.method === method.toUpperCase())
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
  if (!draft.name.trim()) return 'Override name is required.'
  if (!isValidDomainPattern(draft.url)) return 'Use a website domain like localhost:4200, *.example.com, or *.'
  if (requestUrlKey(draft.requestUrl) === null) return 'Enter a complete HTTP or HTTPS request URL.'
  if (!NETWORK_METHODS.includes(draft.method)) return 'Choose an HTTP method or Any.'
  if (!Number.isInteger(draft.status) || draft.status < 200 || draft.status > 599) return 'Use a status code from 200 to 599.'
  for (const { key, value } of cleanResponseHeaders(draft.headers)) {
    if (!key || !/^[!#$%&'*+.^_`|~\w-]+$/.test(key) || /[\r\n\0]/.test(value)) return 'Each response header needs a valid name and a value without line breaks.'
    if (/^(set-cookie|set-cookie2)$/i.test(key)) return 'Mock headers cannot set browser cookies. Remove Set-Cookie.'
    try { new Headers([[key, value]]) } catch { return 'Response headers contain an invalid value.' }
  }
  return null
}

export function jsonBodyWarning(draft: NetworkOverrideDraft): string | null {
  const contentType = draft.headers.find(header => header.key.trim().toLowerCase() === 'content-type')?.value ?? ''
  if (!/\bjson\b/i.test(contentType)) return null
  try { JSON.parse(draft.body); return null } catch { return 'The body is not valid JSON. You can still save and return this text.' }
}

export function normalizeNetworkOverrides(input: unknown): NetworkOverride[] {
  if (!Array.isArray(input)) return []
  return input.flatMap((value, index) => {
    if (!value || typeof value !== 'object') return []
    const item = value as Partial<NetworkOverride>
    const headers = Array.isArray(item.headers) ? item.headers.flatMap(header =>
      header && typeof header.key === 'string' && typeof header.value === 'string'
        ? [{ key: header.key, value: header.value }] : []) : []
    const entry: NetworkOverride = {
      id: typeof item.id === 'string' && item.id ? item.id : crypto.randomUUID(),
      name: typeof item.name === 'string' ? item.name.trim() : '',
      url: getDomainPattern(typeof item.url === 'string' ? item.url : '*'),
      requestUrl: typeof item.requestUrl === 'string' ? item.requestUrl.trim() : '',
      method: NETWORK_METHODS.includes(item.method as NetworkMethod) ? item.method! : 'GET',
      enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
      order: typeof item.order === 'number' && Number.isFinite(item.order) ? item.order : index,
      mode: item.mode === 'call-server' ? 'call-server' : 'bypass',
      body: typeof item.body === 'string' ? item.body : '',
      status: typeof item.status === 'number' ? item.status : 200,
      headers: cleanResponseHeaders(headers),
    }
    // Invalid persisted entries remain editable, but can never intercept.
    if (validateNetworkOverride(entry)) entry.enabled = false
    return [entry]
  }).sort((a, b) => a.order - b.order).map((entry, order) => ({ ...entry, order }))
}
