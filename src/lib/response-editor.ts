import { applyEdits, createScanner, format, parseTree, printParseErrorCode } from 'jsonc-parser'
import type { ParseError } from 'jsonc-parser'

export type BodyAnalysis = {
  available: boolean
  reason: string | null
  error?: { message: string; offset: number; length: number; line: number; column: number }
}
const limitedReason = 'Format is unavailable for bodies over 1 MB or with very deep nesting. Editing and saving remain available.'

export function analyzeResponseBody(body: string): BodyAnalysis {
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

export function formatResponseBody(body: string): string {
  const analysis = analyzeResponseBody(body)
  if (!analysis.available) throw new Error(analysis.reason!)
  // Apply whitespace edits to the source, preserving duplicate keys and numeric tokens.
  return applyEdits(body, format(body, undefined, { insertSpaces: true, tabSize: 2, eol: '\n' }))
}
