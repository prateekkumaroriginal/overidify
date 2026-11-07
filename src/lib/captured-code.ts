import { createScanner } from 'jsonc-parser'

export type CapturedCodePart = { text: string; className?: string; matchIndex?: number }
export type CapturedTextMatch = { from: number; to: number }
const capturedCodeLimit = 64_000

export function findCapturedText(value: string, query: string, limit = 1_000) {
  const matches: CapturedTextMatch[] = []
  if (!query) return { matches, hasMore: false }
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu')
  for (let match = pattern.exec(value); match; match = pattern.exec(value)) {
    if (matches.length === limit) return { matches, hasMore: true }
    matches.push({ from: match.index, to: match.index + match[0].length })
  }
  return { matches, hasMore: false }
}

export function decorateCapturedCode(parts: CapturedCodePart[], matches: CapturedTextMatch[]): CapturedCodePart[] {
  if (!matches.length) return parts
  const decorated: CapturedCodePart[] = []
  let offset = 0
  let matchIndex = 0
  for (const part of parts) {
    const end = offset + part.text.length
    let cursor = offset
    while (cursor < end) {
      while (matchIndex < matches.length && matches[matchIndex].to <= cursor) matchIndex++
      const match = matches[matchIndex]
      const inside = !!match && match.from <= cursor
      const next = Math.min(end, match ? inside ? match.to : match.from : end)
      decorated.push({ text: part.text.slice(cursor - offset, next - offset), className: part.className, ...(inside ? { matchIndex } : {}) })
      cursor = next
    }
    offset = end
  }
  return decorated
}

export function capturedCodeLines(parts: CapturedCodePart[]): CapturedCodePart[][] {
  const lines: CapturedCodePart[][] = [[]]
  for (const part of parts) {
    part.text.split('\n').forEach((text, index) => {
      if (index) lines.push([])
      if (text) lines[lines.length - 1].push({ ...part, text })
    })
  }
  return lines
}

export function previewCapturedCode(value: string, maxLines = 14, maxCharacters = 1_000) {
  let totalLines = 1
  let lineCut = value.length
  for (let next = value.indexOf('\n'); next !== -1; next = value.indexOf('\n', next + 1)) {
    if (totalLines === maxLines) lineCut = next
    totalLines++
  }
  if (value.length <= capturedCodeLimit) return { text: value, totalLines, shownLines: totalLines, truncated: false, partialLine: false }
  let end = Math.min(lineCut, maxCharacters, value.length)
  // Avoid splitting a UTF-16 surrogate pair at the character budget.
  if (end > 0 && end < value.length && /[\uD800-\uDBFF]/.test(value[end - 1]) && /[\uDC00-\uDFFF]/.test(value[end])) end--
  const text = value.slice(0, end)
  return { text, totalLines, shownLines: text.split('\n').length, truncated: end < value.length, partialLine: end < value.length && value[end] !== '\n' }
}

// Bound highlighting work for large captured bodies. Text is always retained
// verbatim, including invalid JSON, duplicate keys and numeric spellings.
export function highlightCapturedJson(value: string): CapturedCodePart[] {
  if (value.length > capturedCodeLimit || !/^\s*(?:\[|{)/.test(value)) return [{ text: value }]
  const scanner = createScanner(value, true)
  const tokens: { text: string; from: number; to: number }[] = []
  for (;;) {
    scanner.scan()
    const from = scanner.getTokenOffset()
    const to = from + scanner.getTokenLength()
    if (from === to) break
    tokens.push({ text: value.slice(from, to), from, to })
  }
  const parts: CapturedCodePart[] = []
  let cursor = 0
  tokens.forEach((token, index) => {
    const className = token.text.startsWith('"') ? tokens[index + 1]?.text === ':' ? 'execution-code-key' : 'execution-code-string'
      : /^-?\d/.test(token.text) ? 'execution-code-number'
      : ['true', 'false', 'null'].includes(token.text) ? 'execution-code-keyword' : undefined
    if (!className) return
    if (token.from > cursor) parts.push({ text: value.slice(cursor, token.from) })
    parts.push({ text: value.slice(token.from, token.to), className })
    cursor = token.to
  })
  if (cursor < value.length || !parts.length) parts.push({ text: value.slice(cursor) })
  return parts
}
