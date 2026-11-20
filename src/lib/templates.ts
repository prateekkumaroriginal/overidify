import * as z from 'zod/mini'

/**
 * A rule field that may hold variable references. A plain string is always literal,
 * even when it reads `{{NAME}}`. Only a reference segment, created by picking a
 * variable from the `{{` suggestions, links to a variable.
 */
export type VariableToken = { variableId: string; name: string }
export type TemplateSegment = string | VariableToken
export type TemplateObject = { segments: TemplateSegment[] }
export type TemplateText = string | TemplateObject

export const VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/
export const VARIABLE_NAME_MAX_LENGTH = 64

export function isValidVariableName(name: string): boolean {
  return name.length <= VARIABLE_NAME_MAX_LENGTH && VARIABLE_NAME_PATTERN.test(name)
}

const VariableTokenSchema = z.object({ variableId: z.string(), name: z.string().check(z.refine(isValidVariableName)) })
const TemplateObjectSchema = z.object({ segments: z.array(z.union([z.string(), VariableTokenSchema])) })
export const TemplateTextSchema = z.pipe(z.union([z.string(), TemplateObjectSchema]), z.transform(value => canonicalTemplate(value)))

export function isToken(segment: unknown): segment is VariableToken {
  return !!segment && typeof segment === 'object' && typeof (segment as VariableToken).variableId === 'string' &&
    typeof (segment as VariableToken).name === 'string'
}

export function isTemplateObject(value: unknown): value is TemplateObject {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Array.isArray((value as TemplateObject).segments)
}

export const isStoredTemplate = (value: unknown): value is TemplateText => typeof value === 'string' || isTemplateObject(value)

export function templateSegments(value: TemplateText): TemplateSegment[] {
  return typeof value === 'string' ? (value ? [value] : []) : value.segments
}

/** Merges adjacent text, drops empty text, and stores a template without tokens as a plain string. */
export function fromSegments(segments: readonly TemplateSegment[]): TemplateText {
  const merged: TemplateSegment[] = []
  for (const segment of segments) {
    if (typeof segment !== 'string') merged.push({ variableId: segment.variableId, name: segment.name })
    else if (segment && typeof merged.at(-1) === 'string') merged[merged.length - 1] += segment
    else if (segment) merged.push(segment)
  }
  return merged.some(isToken) ? { segments: merged } : (merged[0] as string | undefined) ?? ''
}

export function canonicalTemplate(value: TemplateText): TemplateText {
  return typeof value === 'string' ? value : fromSegments(value.segments)
}

/** Repairs stored data without failing. Malformed tokens become literal `{{name}}` text. */
export function normalizeStoredTemplate(input: unknown, fallback: TemplateText = ''): TemplateText {
  if (typeof input === 'string') return input
  if (!isTemplateObject(input)) return fallback
  return fromSegments(input.segments.flatMap((segment: unknown): TemplateSegment[] => {
    if (typeof segment === 'string') return [segment]
    if (isToken(segment)) return [isValidVariableName(segment.name) ? segment : `{{${segment.name}}}`]
    return []
  }))
}

export function hasTokens(value: TemplateText): value is TemplateObject {
  return typeof value !== 'string' && value.segments.some(isToken)
}

export function templateTokens(value: TemplateText): VariableToken[] {
  return typeof value === 'string' ? [] : value.segments.filter(isToken)
}

/** Literal text with each token written `{{NAME}}`. Never contains variable values. */
export function displayText(value: TemplateText, nameOf: (token: VariableToken) => string = token => token.name): string {
  return typeof value === 'string' ? value : value.segments.map(segment => typeof segment === 'string' ? segment : `{{${nameOf(segment)}}}`).join('')
}

export function templatesEqual(left: TemplateText, right: TemplateText): boolean {
  return JSON.stringify(canonicalTemplate(left)) === JSON.stringify(canonicalTemplate(right))
}

/** Empty text and whitespace-only literal text are blank. A token is content. */
export function isBlankTemplate(value: TemplateText): boolean {
  return templateSegments(value).every(segment => typeof segment === 'string' && !segment.trim())
}

/** Trims the outer literal edges. Text between tokens and values filled in later are never trimmed. */
export function trimTemplate(value: TemplateText): TemplateText {
  if (typeof value === 'string') return value.trim()
  const segments = [...templateSegments(canonicalTemplate(value))]
  if (typeof segments[0] === 'string') segments[0] = segments[0].trimStart()
  const last = segments.length - 1
  if (typeof segments[last] === 'string') segments[last] = (segments[last] as string).trimEnd()
  return fromSegments(segments)
}

/** Applies a transformation meant for literal text only; templates are only trimmed. */
export function mapLiteral(value: TemplateText, transform: (literal: string) => string): TemplateText {
  return hasTokens(value) ? trimTemplate(value) : transform(displayText(value))
}

export function mapTokens(value: TemplateText, map: (token: VariableToken) => TemplateSegment): TemplateText {
  if (!hasTokens(value)) return value
  return fromSegments(value.segments.map(segment => typeof segment === 'string' ? segment : map(segment)))
}
