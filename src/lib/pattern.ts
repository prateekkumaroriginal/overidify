function escapeRegexSegment(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export type WebsiteScope = string | string[]

export function getDomainPatterns(scope: WebsiteScope): string[] {
  return Array.isArray(scope) ? scope : scope ? [scope] : []
}

export function normalizeWebsiteScope(scope: WebsiteScope): WebsiteScope {
  const domains = [...new Set(getDomainPatterns(scope).map(getDomainPattern))]
  return domains.length === 1 ? domains[0] : domains
}

export function updateWebsiteScope(scope: WebsiteScope, pattern: string, editing: number | null): WebsiteScope {
  if (!pattern.trim()) {
    if (editing !== null) throw new Error('Enter a domain or remove it from the list.')
    return scope
  }
  if (!isValidDomainPattern(pattern)) throw new Error('Use a website domain like localhost:4200, *.example.com, or *.')
  const domains = getDomainPatterns(scope)
  const domain = getDomainPattern(pattern)
  if (domains.some((existing, index) => index !== editing && getDomainPattern(existing) === domain)) {
    throw new Error('This domain is already in the list.')
  }
  return normalizeWebsiteScope(editing === null ? [...domains, domain] : domains.map((existing, index) => index === editing ? domain : existing))
}

export function getDomainPattern(pattern: string): string {
  return pattern.trim()
    .replace(/^(?:[a-z][a-z\d+.-]*|\*):\/\//i, '')
    .replace(/^\/\//, '')
    .split(/[/?#]/, 1)[0]
    .toLowerCase()
}

export function isValidDomainPattern(pattern: string): boolean {
  const domain = getDomainPattern(pattern)
  if (!domain || /[\s@\\]/.test(domain)) return false
  try {
    const parsed = new URL(`http://${domain.replaceAll('*', 'wildcard')}`)
    return Boolean(parsed.hostname) && !domain.endsWith(':')
  } catch {
    return false
  }
}

export function domainPatternToRegexFilter(pattern: string): string {
  // Existing entries may contain a full URL. Only their host and port matter.
  if (!isValidDomainPattern(pattern)) return '^$'
  const domain = getDomainPattern(pattern)
  const host = Array.from(domain)
    .map((character) => character === '*' ? '[^/:?#]*' : escapeRegexSegment(character))
    .join('')
  const port = /:\d+$/.test(domain) ? '' : '(?::[0-9]+)?'
  return `^(https?|wss?)://${host}${port}([/?#]|$)`
}

export function matchesPageDomain(scope: WebsiteScope, pageUrl: string): boolean {
  return /^https?:\/\//i.test(pageUrl) && getDomainPatterns(scope).some(pattern =>
    new RegExp(domainPatternToRegexFilter(pattern), 'i').test(pageUrl))
}
