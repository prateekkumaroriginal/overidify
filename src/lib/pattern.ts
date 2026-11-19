import { canonicalTemplate, displayText, hasTokens, isBlankTemplate, mapLiteral } from './templates.ts'
import type { TemplateText } from './templates.ts'

function escapeRegexSegment(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** A rule's website domains. A domain may hold variable references. */
export type WebsiteScope = TemplateText | TemplateText[]
/** Website domains after variables are filled in. */
export type PlainWebsiteScope = string | string[]

export function getDomainPatterns<Domain extends TemplateText>(scope: Domain | Domain[]): Domain[] {
  return Array.isArray(scope) ? scope : (typeof scope === 'string' ? scope : !isBlankTemplate(scope)) ? [scope] : []
}

/** Literal domains keep only their host; a domain with a variable is checked once its value is filled in. */
function normalizeDomain(domain: TemplateText): TemplateText {
  return mapLiteral(domain, getDomainPattern)
}

const domainKey = (domain: TemplateText) => JSON.stringify(canonicalTemplate(domain))

export function normalizeWebsiteScope(scope: WebsiteScope): WebsiteScope {
  const seen = new Set<string>()
  const domains = getDomainPatterns(scope).map(normalizeDomain).filter(domain => {
    const key = domainKey(domain)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return domains.length === 1 ? domains[0] : domains
}

export function updateWebsiteScope(scope: WebsiteScope, pattern: TemplateText, editing: number | null): WebsiteScope {
  if (isBlankTemplate(pattern)) {
    if (editing !== null) throw new Error('Enter a domain or remove it from the list.')
    return scope
  }
  if (!hasTokens(pattern) && !isValidDomainPattern(displayText(pattern))) throw new Error('Use a website domain like localhost:4200, *.example.com, or *.')
  const domains = getDomainPatterns(scope)
  const domain = normalizeDomain(pattern)
  if (domains.some((existing, index) => index !== editing && domainKey(normalizeDomain(existing)) === domainKey(domain))) {
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

export function matchesPageDomain(scope: PlainWebsiteScope, pageUrl: string): boolean {
  return /^https?:\/\//i.test(pageUrl) && getDomainPatterns(scope).some(pattern =>
    new RegExp(domainPatternToRegexFilter(pattern), 'i').test(pageUrl))
}
