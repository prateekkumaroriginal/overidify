function escapeRegexSegment(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
  // Existing switchers may contain a full URL. Only their host and port matter.
  if (!isValidDomainPattern(pattern)) return '^$'
  const domain = getDomainPattern(pattern)
  const host = Array.from(domain)
    .map((character) => character === '*' ? '[^/:?#]*' : escapeRegexSegment(character))
    .join('')
  const port = /:\d+$/.test(domain) ? '' : '(?::[0-9]+)?'
  return `^(https?|wss?)://${host}${port}([/?#]|$)`
}

export function patternToRegexFilter(pattern: string): string {
  const trimmed = pattern.trim()

  if (!trimmed || trimmed === '*') {
    return '^.*$'
  }

  return `^${Array.from(trimmed)
    .map((character) =>
      character === '*' ? '.*' : escapeRegexSegment(character),
    )
    .join('')}$`
}

export function isValidUrlPattern(pattern: string): boolean {
  const trimmed = pattern.trim()

  if (!trimmed) {
    return false
  }

  try {
    new RegExp(patternToRegexFilter(trimmed))
    return true
  } catch {
    return false
  }
}
