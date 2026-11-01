import { applyEdits, createScanner, format, parseTree, printParseErrorCode } from 'jsonc-parser'
import type { ParseError } from 'jsonc-parser'

export type BodyAnalysis = {
  available: boolean
  reason: string | null
  error?: { message: string; offset: number; length: number; line: number; column: number }
}
const limitedReason = 'Format is unavailable for bodies over 1 MB or with very deep nesting. Editing and saving remain available.'

// Compare decimal values without rounding them through a JavaScript number.
function decimalIdentity(text: string): string {
  const [mantissa, exponent = '0'] = text.toLowerCase().split('e')
  const [whole, fraction = ''] = mantissa.split('.')
  let digits = (whole + fraction).replace(/^-/, '').replace(/^0+/, '') || '0'
  let power = BigInt(exponent) - BigInt(fraction.length)
  const trimmed = digits.replace(/0+$/, '') || '0'
  power += BigInt(digits.length - trimmed.length)
  digits = trimmed
  return `${text.startsWith('-') ? '-' : ''}${digits}:${digits === '0' ? 0n : power}`
}

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
  const pending = [root]
  while (pending.length) {
    const node = pending.pop()!
    if (node.type === 'object') {
      const keys = new Set<string>()
      for (const property of node.children ?? []) {
        const key = property.children![0].value as string
        if (keys.has(key)) return { available: false, reason: 'Format is unavailable because this body has duplicate object keys. Editing and saving preserve the exact text.' }
        keys.add(key)
      }
    }
    if (node.type === 'number') {
      const token = body.slice(node.offset, node.offset + node.length)
      // Bound exponent parsing too, for adversarial numeric literals.
      const exponent = token.toLowerCase().split('e')[1] ?? ''
      if (!Number.isFinite(node.value) || exponent.length > 10 || decimalIdentity(token) !== decimalIdentity(JSON.stringify(node.value))) {
        return { available: false, reason: 'Format is unavailable because a number cannot be represented faithfully. Editing and saving preserve the exact text.' }
      }
    }
    if (node.children) for (const child of node.children) pending.push(child)
  }
  return { available: true, reason: null }
}

export function formatResponseBody(body: string): string {
  const analysis = analyzeResponseBody(body)
  if (!analysis.available) throw new Error(analysis.reason!)
  return applyEdits(body, format(body, undefined, { insertSpaces: true, tabSize: 2, eol: '\n' }))
}
