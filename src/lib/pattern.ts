import { displayText, hasReferences, isTemplateEmpty, templatesEqual, trimTemplateEdges } from './templates.ts'
import type { TemplateText } from './templates.ts'

function escapeRegexSegment(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export type WebsiteScope = string | string[]
// Saved scopes can hold template domains; matching always uses resolved strings.
export type TemplateWebsiteScope = TemplateText | TemplateText[]

export function getDomainPatterns<Domain extends TemplateText>(scope: Domain | Domain[]): Domain[] {
  return Array.isArray(scope) ? scope : scope ? [scope] : []
}

/** Literal domains keep today's normalization; a domain with a reference keeps its case so names stay case-sensitive. */
export function normalizeDomain(domain: TemplateText): TemplateText {
  return hasReferences(domain) ? trimTemplateEdges(domain) : getDomainPattern(displayText(domain))
}

export function normalizeWebsiteScope(scope: WebsiteScope): WebsiteScope
export function normalizeWebsiteScope(scope: TemplateWebsiteScope): TemplateWebsiteScope
export function normalizeWebsiteScope(scope: TemplateWebsiteScope): TemplateWebsiteScope {
  const seen = new Set<string>()
  const domains = getDomainPatterns(scope).map(normalizeDomain).filter(domain => {
    const key = JSON.stringify(domain)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return domains.length === 1 ? domains[0] : domains
}

export function updateWebsiteScope(scope: TemplateWebsiteScope, pattern: TemplateText, editing: number | null): TemplateWebsiteScope {
  if (isTemplateEmpty(trimTemplateEdges(pattern))) {
    if (editing !== null) throw new Error('Enter a domain or remove it from the list.')
    return scope
  }
  // A domain containing a variable is checked once its value is filled in.
  if (!hasReferences(pattern) && !isValidDomainPattern(displayText(pattern))) throw new Error('Use a website domain like localhost:4200, *.example.com, or *.')
  const domains = getDomainPatterns(scope)
  const domain = normalizeDomain(pattern)
  if (domains.some((existing, index) => index !== editing && templatesEqual(normalizeDomain(existing), domain))) {
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
