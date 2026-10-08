function escapeRegexSegment(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
