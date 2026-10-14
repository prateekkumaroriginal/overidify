import type { NetworkOverride } from './network-overrides.ts'

// Include repeated query keys while ignoring their order and URL fragments.
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
