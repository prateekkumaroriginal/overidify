import type { TemplateWebsiteScope } from './pattern.ts'
import { compareNames, displayText, isValidVariableName, renameTemplateReferences, templateReferences, VARIABLE_NAME_MAX_LENGTH, VARIABLE_NAME_PATTERN } from './templates.ts'
import type { TemplateText } from './templates.ts'
import type { NetworkRule } from './network-rules.ts'
import type { HeaderPair, RequestHeaderRule } from './types.ts'

export type Variable = { id: string; name: string; value: string }
export const VARIABLES_STORAGE_KEY = 'variables'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
type Rules = { requestHeaderRules: RequestHeaderRule[]; networkRules: NetworkRule[] }

/** Keeps invalid names so they can be fixed, but they never resolve references. */
export function normalizeVariables(input: unknown): Variable[] {
  if (!Array.isArray(input)) return []
  const names = new Set<string>(), ids = new Set<string>()
  return input.flatMap(entry => {
    if (!entry || typeof entry !== 'object') return []
    const { id, name, value } = entry as Record<string, unknown>
    if (typeof name !== 'string' || typeof value !== 'string' || names.has(name)) return []
    names.add(name)
    let nextId = typeof id === 'string' && UUID.test(id) ? id.toLowerCase() : crypto.randomUUID()
    while (ids.has(nextId)) nextId = crypto.randomUUID()
    ids.add(nextId)
    return [{ id: nextId, name, value }]
  })
}

export function sortVariables(variables: readonly Variable[]): Variable[] {
  return [...variables].sort((left, right) => compareNames(left.name, right.name))
}

export const NAME_PATTERN_MESSAGE = 'Use letters, digits, and underscores, starting with a letter or underscore.'
export const NAME_LENGTH_MESSAGE = `Use ${VARIABLE_NAME_MAX_LENGTH} characters or fewer.`
export const NAME_DUPLICATE_MESSAGE = 'Another variable already uses this name.'

export function variableNameError(name: string): string {
  if (name.length > VARIABLE_NAME_MAX_LENGTH) return NAME_LENGTH_MESSAGE
  return VARIABLE_NAME_PATTERN.test(name) ? '' : NAME_PATTERN_MESSAGE
}

/** Values keyed by name. Only valid names resolve references. */
export function variableValues(variables: readonly Variable[]): Map<string, string> {
  return new Map(variables.filter(variable => isValidVariableName(variable.name)).map(variable => [variable.name, variable.value]))
}

export type RuleType = 'header-rule' | 'switch-rule' | 'network-rule'
export type ReferenceUsage = { id: string; name: TemplateText; type: RuleType; fields: string[]; count: number }

type FieldVisitor = (value: TemplateText, field: string) => TemplateText

function mapScope(scope: TemplateWebsiteScope, visit: FieldVisitor): TemplateWebsiteScope {
  return Array.isArray(scope) ? scope.map(domain => visit(domain, 'Website domain')) : visit(scope, 'Website domain')
}

/** Visits every template field of a rule, returning a rule with the visitor's replacements. */
export function mapRuleTemplates<Rule extends RequestHeaderRule | NetworkRule>(rule: Rule, visit: FieldVisitor): Rule {
  const base = { ...rule, name: visit(rule.name, 'Rule name'), url: mapScope(rule.url, visit) }
  const pairs = (headers: HeaderPair[], prefix: string, noun: string) =>
    headers.map(header => ({ key: visit(header.key, `${prefix}${noun} name`), value: visit(header.value, `${prefix}${noun} value`) }))
  if (!('kind' in rule)) {
    const network = rule as NetworkRule
    return { ...base, requestUrl: visit(network.requestUrl, 'Request URL'), body: visit(network.body, 'Response body'),
      headers: pairs(network.headers, '', 'Response header') } as Rule
  }
  if (rule.kind === 'header-rule') return { ...base, headers: pairs(rule.headers, '', 'Header') } as Rule
  return { ...base, options: rule.options.map(option => {
    const prefix = `Option "${displayText(option.name)}" · `
    return { ...option, name: visit(option.name, `${prefix}Option name`), headers: pairs(option.headers, prefix, 'Header') }
  }) } as Rule
}

/** One source for Used by, delete confirmation, the missing section, and import review. */
export function collectVariableReferences(rules: Rules): Map<string, ReferenceUsage[]> {
  const usages = new Map<string, ReferenceUsage[]>()
  for (const rule of [...rules.requestHeaderRules, ...rules.networkRules]) {
    const found = new Map<string, ReferenceUsage>()
    mapRuleTemplates(rule, (value, field) => {
      for (const name of templateReferences(value)) {
        const usage = found.get(name) ?? { id: rule.id, name: rule.name, type: 'kind' in rule ? rule.kind : 'network-rule', fields: [], count: 0 }
        if (!usage.fields.includes(field)) usage.fields.push(field)
        usage.count++
        found.set(name, usage)
      }
      return value
    })
    for (const [name, usage] of found) usages.set(name, [...usages.get(name) ?? [], usage])
  }
  return usages
}

export function renameRuleReferences(rules: Rules, mapping: ReadonlyMap<string, string>) {
  let headerChanged = false, networkChanged = false
  const rename = <Rule extends RequestHeaderRule | NetworkRule>(rule: Rule, mark: () => void) => mapRuleTemplates(rule, value => {
    const next = renameTemplateReferences(value, mapping)
    if (next !== value) mark()
    return next
  })
  const result: Rules = {
    requestHeaderRules: rules.requestHeaderRules.map(rule => rename(rule, () => { headerChanged = true })),
    networkRules: rules.networkRules.map(rule => rename(rule, () => { networkChanged = true })),
  }
  return { rules: result, headerChanged, networkChanged }
}

export type VariablesSavePlan =
  | { ok: false; errors: Record<string, string> }
  | { ok: true; variables: Variable[]; rules: Rules; variablesChanged: boolean; headerChanged: boolean; networkChanged: boolean
    renames: Map<string, string>; newlyMissing: Map<string, ReferenceUsage[]> }

const edited = (draft: Variable, baseline?: Variable) => !baseline || draft.name !== baseline.name || draft.value !== baseline.value

/**
 * Applies a draft as a diff keyed by variable ID onto the latest stored set.
 * Rows this draft did not touch keep any change another window saved.
 */
export function planVariablesSave({ stored, baseline, draft, rules }: { stored: Variable[]; baseline: Variable[]; draft: Variable[]; rules: Rules }): VariablesSavePlan {
  const errors: Record<string, string> = {}
  const draftNames = new Set<string>()
  for (const row of draft) {
    const error = variableNameError(row.name) || (draftNames.has(row.name) ? NAME_DUPLICATE_MESSAGE : '')
    if (error) errors[row.id] = error
    draftNames.add(row.name)
  }
  if (Object.keys(errors).length) return { ok: false, errors }

  const baselineById = new Map(baseline.map(row => [row.id, row]))
  const draftById = new Map(draft.map(row => [row.id, row]))
  const storedById = new Map(stored.map(row => [row.id, row]))
  const variables: Variable[] = []
  const renames = new Map<string, string>()
  for (const current of stored) {
    const row = draftById.get(current.id), base = baselineById.get(current.id)
    if (row) {
      if (edited(row, base)) {
        variables.push({ ...row })
        if (current.name !== row.name && isValidVariableName(current.name)) renames.set(current.name, row.name)
      } else variables.push(current)
    } else if (!base) variables.push(current)
  }
  for (const row of draft) {
    if (storedById.has(row.id)) continue
    const base = baselineById.get(row.id)
    // A row edited here but deleted elsewhere is recreated with the same ID.
    if (edited(row, base)) {
      variables.push({ ...row })
      if (base && base.name !== row.name && isValidVariableName(base.name)) renames.set(base.name, row.name)
    }
  }
  const owners = new Map<string, string>()
  for (const row of variables) {
    const owner = owners.get(row.name)
    if (owner !== undefined) errors[draftById.has(row.id) ? row.id : owner] = NAME_DUPLICATE_MESSAGE
    owners.set(row.name, row.id)
  }
  if (Object.keys(errors).length) return { ok: false, errors }

  const renamed = renameRuleReferences(rules, renames)
  const before = new Set([...variableValues(stored).keys()])
  const after = new Set([...variableValues(variables).keys()])
  const newlyMissing = new Map([...collectVariableReferences(renamed.rules)].filter(([name]) => before.has(name) && !after.has(name)))
  const variablesChanged = JSON.stringify(sortVariables(variables)) !== JSON.stringify(sortVariables(stored))
  return { ok: true, variables, rules: renamed.rules, variablesChanged, headerChanged: renamed.headerChanged,
    networkChanged: renamed.networkChanged, renames, newlyMissing }
}

/** Names referenced by saved rules that have no saved variable. */
export function missingReferences(rules: Rules, variables: readonly Variable[]) {
  const known = variableValues(variables)
  return new Map([...collectVariableReferences(rules)].filter(([name]) => !known.has(name)))
}
