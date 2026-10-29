import { applyEdits, createScanner, format, parseTree, printParseErrorCode } from 'jsonc-parser'
import type { Node, ParseError } from 'jsonc-parser'

export type BodyAnalysis = {
  available: boolean
  reason: string | null
  root?: Node
  error?: { message: string; offset: number; length: number; line: number; column: number }
}
const limitedReason = 'Tree and Format are unavailable for bodies over 1 MB or with very deep nesting. Code and Save remain available.'

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
    return { available: false, reason: `Tree and Format need valid JSON. ${message} at line ${line}, column ${column}.`,
      error: { message, offset, length: first?.length ?? 0, line, column } }
  }
  const pending = [root]
  while (pending.length) {
    const node = pending.pop()!
    if (node.type === 'object') {
      const keys = new Set<string>()
      for (const property of node.children ?? []) {
        const key = property.children![0].value as string
        if (keys.has(key)) return { available: false, reason: 'Tree and Format are unavailable because this body has duplicate object keys. Code and Save preserve the exact text.' }
        keys.add(key)
      }
    }
    if (node.type === 'number') {
      const token = body.slice(node.offset, node.offset + node.length)
      // Bound exponent parsing too, for adversarial numeric literals.
      const exponent = token.toLowerCase().split('e')[1] ?? ''
      if (!Number.isFinite(node.value) || exponent.length > 10 || decimalIdentity(token) !== decimalIdentity(JSON.stringify(node.value))) {
        return { available: false, reason: 'Tree and Format are unavailable because a number cannot be represented faithfully. Code and Save preserve the exact text.' }
      }
    }
    if (node.children) for (const child of node.children) pending.push(child)
  }
  return { available: true, reason: null, root }
}

export function formatResponseBody(body: string): string {
  const analysis = analyzeResponseBody(body)
  if (!analysis.available) throw new Error(analysis.reason!)
  return applyEdits(body, format(body, undefined, { insertSpaces: true, tabSize: 2, eol: '\n' }))
}

export type JsonPath = (string | number)[]
export type TreeEdit =
  | { type: 'replace'; path: JsonPath; value: string }
  | { type: 'add'; path: JsonPath; key?: string; value: string }
  | { type: 'rename'; path: JsonPath; key: string }
  | { type: 'remove'; path: JsonPath }
  | { type: 'move'; path: JsonPath; to: number }
type JsonValue = null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue }

export function editResponseTree(body: string, edit: TreeEdit): string {
  const analysis = analyzeResponseBody(body)
  if (!analysis.available) throw new Error(analysis.reason!)
  let root = JSON.parse(body) as JsonValue
  function at(path: JsonPath): JsonValue {
    let value = root
    for (const key of path) {
      if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) throw new Error('This value no longer exists.')
      value = (value as Record<string | number, JsonValue>)[key]
    }
    return value
  }
  function replace(path: JsonPath, value: JsonValue) {
    if (!path.length) { root = value; return }
    at(path)
    const parent = at(path.slice(0, -1))
    Object.defineProperty(parent, path.at(-1)!, { value, writable: true, enumerable: true, configurable: true })
  }
  function input(text: string): JsonValue {
    const parsed = analyzeResponseBody(text)
    if (!parsed.available) throw new Error(parsed.reason!)
    return JSON.parse(text) as JsonValue
  }
  const target = at(edit.path)
  if (edit.type === 'replace') replace(edit.path, input(edit.value))
  else if (edit.type === 'add') {
    const value = input(edit.value)
    if (Array.isArray(target)) target.push(value)
    else if (target && typeof target === 'object' && edit.key !== undefined) {
      if (Object.hasOwn(target, edit.key)) throw new Error('This property already exists.')
      Object.defineProperty(target, edit.key, { value, writable: true, enumerable: true, configurable: true })
    } else throw new Error('Choose an object or array to add a value.')
  } else {
    if (!edit.path.length) throw new Error('Replace the root value instead.')
    const parentPath = edit.path.slice(0, -1), key = edit.path.at(-1)!, parent = at(parentPath)
    if (edit.type === 'rename') {
      if (!parent || Array.isArray(parent) || typeof parent !== 'object') throw new Error('Only object properties can be renamed.')
      if (edit.key !== key && Object.hasOwn(parent, edit.key)) throw new Error('This property already exists.')
      replace(parentPath, Object.fromEntries(Object.entries(parent).map(([name, value]) => [name === key ? edit.key : name, value])))
    } else if (edit.type === 'remove') {
      if (Array.isArray(parent)) parent.splice(Number(key), 1)
      else delete (parent as Record<string, JsonValue>)[key]
    } else {
      if (!Array.isArray(parent) || !Number.isInteger(edit.to) || edit.to < 0 || edit.to >= parent.length) throw new Error('Choose a valid array position.')
      parent.splice(edit.to, 0, parent.splice(Number(key), 1)[0])
    }
  }
  return JSON.stringify(root, null, 2)
}
