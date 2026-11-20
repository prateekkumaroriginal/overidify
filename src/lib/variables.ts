import { isValidVariableName, templateTokens, VARIABLE_NAME_MAX_LENGTH, VARIABLE_NAME_PATTERN } from './templates.ts'
import type { TemplateText, VariableToken } from './templates.ts'

/** One global list. A secret value is masked wherever Overidify shows it; storage is not encrypted. */
export type Variable = { id: string; name: string; value: string; secret: boolean }
export const VARIABLES_STORAGE_KEY = 'variables'

export const NAME_PATTERN_MESSAGE = 'Use letters, numbers, and _. Start with a letter or _.'
export const NAME_LENGTH_MESSAGE = `Use ${VARIABLE_NAME_MAX_LENGTH} characters or fewer.`
export const NAME_DUPLICATE_MESSAGE = 'Another variable already has this name.'
export const NAME_REQUIRED_MESSAGE = 'Name is required.'

export function variableNameError(name: string): string {
  if (!name) return NAME_REQUIRED_MESSAGE
  if (name.length > VARIABLE_NAME_MAX_LENGTH) return NAME_LENGTH_MESSAGE
  return VARIABLE_NAME_PATTERN.test(name) ? '' : NAME_PATTERN_MESSAGE
}

/** Names are unique ignoring case. */
export const nameKey = (name: string) => name.toLowerCase()

/** Drops malformed entries, entries with invalid names, and later duplicates of a name or ID. */
export function normalizeVariables(input: unknown): Variable[] {
  if (!Array.isArray(input)) return []
  const names = new Set<string>(), ids = new Set<string>()
  return input.flatMap(entry => {
    if (!entry || typeof entry !== 'object') return []
    const { id, name, value, secret } = entry as Record<string, unknown>
    if (typeof id !== 'string' || !id || typeof name !== 'string' || typeof value !== 'string' || !isValidVariableName(name)) return []
    if (names.has(nameKey(name)) || ids.has(id)) return []
    names.add(nameKey(name))
    ids.add(id)
    return [{ id, name, value, secret: secret === true }]
  })
}

export function sortVariables(variables: readonly Variable[]): Variable[] {
  return [...variables].sort((left, right) => nameKey(left.name).localeCompare(nameKey(right.name)) || left.name.localeCompare(right.name))
}

export type VariableIndex = { byId: Map<string, Variable>; byName: Map<string, Variable> }

export function indexVariables(variables: readonly Variable[]): VariableIndex {
  return { byId: new Map(variables.map(variable => [variable.id, variable])),
    byName: new Map(variables.map(variable => [nameKey(variable.name), variable])) }
}

/**
 * A token follows its variable by ID, so renames keep working. When that variable is gone,
 * a variable with the token's name takes its place, so recreating a deleted name repairs it.
 */
export function findVariable(token: VariableToken, index: VariableIndex): Variable | undefined {
  return index.byId.get(token.variableId) ?? index.byName.get(nameKey(token.name))
}

/** The name to show for a token: the current name of its variable, or the name it had. */
export function tokenName(token: VariableToken, index: VariableIndex): string {
  return findVariable(token, index)?.name ?? token.name
}

export type ResolvedTemplate = { ok: true; value: string } | { ok: false; missing: string[] }

/** One literal pass. Inserted values are never read as templates again. */
export function resolveTemplate(value: TemplateText, index: VariableIndex): ResolvedTemplate {
  if (typeof value === 'string') return { ok: true, value }
  let output = ''
  const missing: string[] = []
  for (const segment of value.segments) {
    if (typeof segment === 'string') { output += segment; continue }
    const variable = findVariable(segment, index)
    if (variable) output += variable.value
    else if (!missing.includes(segment.name)) missing.push(segment.name)
  }
  return missing.length ? { ok: false, missing } : { ok: true, value: output }
}

/** Counts the fields whose template links to a variable, for the Usage column. */
export function countFieldUsage(fields: Iterable<TemplateText>, variables: readonly Variable[]): Map<string, number> {
  const index = indexVariables(variables)
  const counts = new Map<string, number>()
  for (const field of fields) {
    const used = new Set(templateTokens(field).flatMap(token => findVariable(token, index)?.id ?? []))
    for (const id of used) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return counts
}

/** A short secret-safe preview, for suggestions and token hovers. */
export function valuePreview(variable: Variable): string {
  if (variable.secret) return 'Secret value'
  if (!variable.value) return 'Empty value'
  const singleLine = variable.value.replace(/\s+/g, ' ')
  return singleLine.length > 80 ? `${singleLine.slice(0, 79)}…` : singleLine
}
