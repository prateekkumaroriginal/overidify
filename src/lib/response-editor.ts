import { applyEdits, createScanner, format, parseTree, printParseErrorCode } from 'jsonc-parser'
import type { Edit, ParseError } from 'jsonc-parser'

// A variable in the body counts as one JSON value character, so positions and formatting stay exact.
const VARIABLE_CHAR = /\uE000/g
const asJson = (body: string) => body.replace(VARIABLE_CHAR, '0')

export type BodyAnalysis = {
  available: boolean
  reason: string | null
  error?: { message: string; offset: number; length: number; line: number; column: number }
}
const limitedReason = 'Format is unavailable for bodies over 1 MB or with very deep nesting. Editing and saving remain available.'

export function analyzeResponseBody(source: string): BodyAnalysis {
  const body = asJson(source)
  if (body.length > 1_000_000 || new TextEncoder().encode(body).length > 1_000_000) return { available: false, reason: limitedReason }
  const scanner = createScanner(body, true)
  let depth = 0
  for (;;) {
    scanner.scan()
    if (!scanner.getTokenLength()) break
    const token = body.slice(scanner.getTokenOffset(), scanner.getPosition())
    if (token === '{' || token === '[') depth++
    if (token === '}' || token === ']') depth--
    if (depth > 100) return { available: false, reason: limitedReason }
  }
  const errors: ParseError[] = []
  const root = parseTree(body, errors, { disallowComments: true, allowTrailingComma: false })
  if (errors.length || !root) {
    const first = errors[0]
    const offset = first?.offset ?? 0
    const before = body.slice(0, offset).split(/\r\n|\r|\n/)
    const line = before.length, column = before.at(-1)!.length + 1
    const message = first ? printParseErrorCode(first.error).replace(/([a-z])([A-Z])/g, '$1 $2') : 'Expected JSON value'
    return { available: false, reason: `Format needs valid JSON. ${message} at line ${line}, column ${column}.`,
      error: { message, offset, length: first?.length ?? 0, line, column } }
  }
  return { available: true, reason: null }
}

/** Whitespace-only edits, so variables, duplicate keys, and numeric tokens are preserved. */
export function formatEdits(body: string): Edit[] {
  const analysis = analyzeResponseBody(body)
  if (!analysis.available) throw new Error(analysis.reason!)
  return format(asJson(body), undefined, { insertSpaces: true, tabSize: 2, eol: '\n' })
}

export function formatResponseBody(body: string): string {
  return applyEdits(body, formatEdits(body))
}
