import * as z from 'zod/mini'

export type VariableReference = { variable: string }
export type TemplatePart = string | VariableReference
export type TemplateObject = { template: TemplatePart[] }
// Plain strings are always literal. Only a template object can hold references.
export type TemplateText = string | TemplateObject

export const VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/
export const VARIABLE_NAME_MAX_LENGTH = 64

export function isValidVariableName(name: string): boolean {
  return name.length <= VARIABLE_NAME_MAX_LENGTH && VARIABLE_NAME_PATTERN.test(name)
}

export const VariableNameSchema = z.string().check(z.refine(isValidVariableName, { message: 'Variable references need a valid variable name.' }))
// Unknown keys, including any value-like key, are stripped on parse.
export const VariableReferenceSchema = z.object({ variable: VariableNameSchema })
export const TemplatePartSchema = z.union([z.string(), VariableReferenceSchema])
export const TemplateObjectSchema = z.object({ template: z.array(TemplatePartSchema) })
export const TemplateTextSchema = z.pipe(z.union([z.string(), TemplateObjectSchema]), z.transform(value => canonicalTemplate(value)))

export function isReference(part: unknown): part is VariableReference {
  return !!part && typeof part === 'object' && typeof (part as VariableReference).variable === 'string'
}

export function templateParts(value: TemplateText): TemplatePart[] {
  return typeof value === 'string' ? (value ? [value] : []) : value.template
}

export function fromParts(parts: readonly TemplatePart[]): TemplateText {
  const merged: TemplatePart[] = []
  for (const part of parts) {
    if (typeof part === 'string') {
      if (!part) continue
      if (typeof merged.at(-1) === 'string') merged[merged.length - 1] = merged.at(-1) as string + part
      else merged.push(part)
    } else merged.push({ variable: part.variable })
  }
  if (!merged.some(isReference)) return (merged[0] as string | undefined) ?? ''
  return { template: merged }
}

/** Merges adjacent text, drops empty text, and collapses reference-free templates to strings. */
export function canonicalTemplate(value: TemplateText): TemplateText {
  return typeof value === 'string' ? value : fromParts(value.template)
}

/** Repairs persisted data without failing: invalid reference names become literal text. */
export function normalizePersistedTemplate(input: unknown, fallback: TemplateText = ''): TemplateText {
  if (typeof input === 'string') return input
  if (!input || typeof input !== 'object' || !Array.isArray((input as TemplateObject).template)) return fallback
  const parts: TemplatePart[] = []
  for (const part of (input as TemplateObject).template as unknown[]) {
    if (typeof part === 'string') parts.push(part)
    else if (isReference(part)) parts.push(isValidVariableName(part.variable) ? { variable: part.variable } : `{{${part.variable}}}`)
  }
  return fromParts(parts)
}

export function hasReferences(value: TemplateText): boolean {
  return typeof value !== 'string' && value.template.some(isReference)
}

export function templateReferences(value: TemplateText): string[] {
  return typeof value === 'string' ? [] : value.template.flatMap(part => isReference(part) ? [part.variable] : [])
}

/** Literal text with each reference written {{NAME}}. Never contains values. */
export function displayText(value: TemplateText): string {
  return typeof value === 'string' ? value : value.template.map(part => typeof part === 'string' ? part : `{{${part.variable}}}`).join('')
}

export function templatesEqual(left: TemplateText, right: TemplateText): boolean {
  return JSON.stringify(canonicalTemplate(left)) === JSON.stringify(canonicalTemplate(right))
}

export function isTemplateEmpty(value: TemplateText): boolean {
  return templateParts(canonicalTemplate(value)).length === 0
}

/** Trims leading whitespace of a leading text part and trailing whitespace of a trailing text part. */
export function trimTemplateEdges(value: TemplateText): TemplateText {
  if (typeof value === 'string') return value.trim()
  const next = [...templateParts(canonicalTemplate(value))]
  if (typeof next[0] === 'string') next[0] = next[0].trimStart()
  const last = next.length - 1
  if (typeof next[last] === 'string') next[last] = (next[last] as string).trimEnd()
  return fromParts(next)
}

/** Applies a literal-only transformation to a plain string; templates are only edge-trimmed. */
export function mapLiteral(value: TemplateText, transform: (literal: string) => string): TemplateText {
  return typeof value === 'string' || !hasReferences(value) ? transform(displayText(value)) : trimTemplateEdges(value)
}

export type ResolvedTemplate = { ok: true; value: string } | { ok: false; missing: string[] }

/** Single pass: inserted values are never resolved again. */
export function resolveTemplate(value: TemplateText, variables: ReadonlyMap<string, string>): ResolvedTemplate {
  if (typeof value === 'string') return { ok: true, value }
  let output = ''
  const missing: string[] = []
  for (const part of value.template) {
    if (typeof part === 'string') output += part
    else if (variables.has(part.variable)) output += variables.get(part.variable)
    else if (!missing.includes(part.variable)) missing.push(part.variable)
  }
  return missing.length ? { ok: false, missing } : { ok: true, value: output }
}

export function renameTemplateReferences(value: TemplateText, mapping: ReadonlyMap<string, string>): TemplateText {
  if (typeof value === 'string' || !mapping.size) return value
  let changed = false
  const parts = value.template.map(part => {
    if (typeof part === 'string' || !mapping.has(part.variable)) return part
    changed = true
    return { variable: mapping.get(part.variable)! }
  })
  return changed ? fromParts(parts) : value
}

export function appendText(value: TemplateText, text: string): TemplateText {
  return fromParts([...templateParts(value), text])
}

// Clipboard flavor shared by every template field. Text/plain carries display text.
export const TEMPLATE_CLIPBOARD_TYPE = 'application/x-overidify-template+json'

export function serializeTemplateClipboard(parts: readonly TemplatePart[]): string {
  return JSON.stringify({ format: 'overidify-template', version: 1, parts: templateParts(fromParts(parts)) })
}

const ClipboardSchema = z.object({ format: z.literal('overidify-template'), version: z.literal(1), parts: z.array(TemplatePartSchema) })

export function parseTemplateClipboard(text: string | null | undefined): TemplatePart[] | null {
  if (!text) return null
  try {
    const parsed = ClipboardSchema.safeParse(JSON.parse(text))
    return parsed.success ? templateParts(fromParts(parsed.data.parts)) : null
  } catch { return null }
}

/** Exact case-sensitive match, then prefix, then substring; ties sorted by name. */
export function rankVariableSuggestions(names: readonly string[], rawQuery: string): string[] {
  const query = rawQuery.replace(/^ +/, '')
  const lower = query.toLowerCase()
  const rank = (name: string) => name === query ? 0 : name.toLowerCase().startsWith(lower) ? 1 : name.toLowerCase().includes(lower) ? 2 : 3
  return names.filter(name => rank(name) < 3).sort((left, right) => rank(left) - rank(right) || compareNames(left, right))
}

/** Case-insensitive first, then by code point to break ties. */
export function compareNames(left: string, right: string): number {
  const a = left.toLowerCase(), b = right.toLowerCase()
  return a < b ? -1 : a > b ? 1 : left < right ? -1 : left > right ? 1 : 0
}
