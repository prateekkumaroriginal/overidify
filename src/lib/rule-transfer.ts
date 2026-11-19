import * as z from 'zod/mini'
import { RequestHeaderRuleSchema, HeaderRuleDraftSchema, SwitchRuleDraftSchema } from './request-header-schemas.ts'
import { NetworkRuleSchema, NetworkRuleDraftSchema } from './network-schemas.ts'
import type { RequestHeaderRule } from './types.ts'
import type { NetworkRule } from './network-rules.ts'
import { mapRuleTemplates } from './rule-resolution.ts'
import { hasTokens, isTemplateObject, templateTokens } from './templates.ts'
import { indexVariables, nameKey } from './variables.ts'
import type { Variable } from './variables.ts'

export type RuleCollection = { requestHeaderRules: RequestHeaderRule[]; networkRules: NetworkRule[] }
export type TransferRule = RequestHeaderRule | NetworkRule
export type ImportIssue = { name: string; message: string }
/** `missing` names have no local variable; rules using them are imported turned off. */
export type ImportReview = { rules: RuleCollection; issues: ImportIssue[]; overlaps: TransferRule[]; variables: { used: string[]; missing: string[] } }
export type ImportAction = 'replace' | 'add'

const EnvelopeSchema = z.object({
  format: z.literal('overidify'), version: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  requestHeaderRules: z.array(z.unknown()), networkRules: z.array(z.unknown()),
})
export function ruleType(rule: TransferRule): 'header-rule' | 'switch-rule' | 'network-rule' {
  return 'kind' in rule ? rule.kind : 'network-rule'
}

const ruleUsesVariables = (rule: TransferRule) => {
  let found = false
  mapRuleTemplates(rule, value => { if (hasTokens(value)) found = true; return value })
  return found
}

/**
 * Variables are exported by name as `{ "variable": "NAME" }`, never with their values.
 * Version 3 marks files with variables; files without them keep versions 1 and 2.
 */
export function exportRules(rules: RuleCollection): string {
  const all = [...rules.requestHeaderRules, ...rules.networkRules]
  const version = all.some(ruleUsesVariables) ? 3 : all.some(rule => Array.isArray(rule.url)) ? 2 : 1
  const byName = <Rule extends TransferRule>(rule: Rule) => mapRuleTemplates(rule, value => hasTokens(value)
    ? { segments: value.segments.map(segment => typeof segment === 'string' ? segment : { variable: segment.name }) } as never
    : value)
  return JSON.stringify({ format: 'overidify', version,
    requestHeaderRules: rules.requestHeaderRules.map(byName), networkRules: rules.networkRules.map(byName) }, null, 2)
}

/** Links exported `{ "variable": "NAME" }` parts to local variables by name, ignoring case. */
function linkImportedVariables(value: unknown, index: ReturnType<typeof indexVariables>): unknown {
  if (Array.isArray(value)) return value.map(item => linkImportedVariables(item, index))
  if (isTemplateObject(value)) {
    return { segments: value.segments.map((segment: unknown) => {
      if (!segment || typeof segment !== 'object' || typeof (segment as { variable?: unknown }).variable !== 'string') return segment
      const name = (segment as { variable: string }).variable
      return { variableId: index.byName.get(nameKey(name))?.id ?? '', name }
    }) }
  }
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, linkImportedVariables(item, index)]))
  return value
}

export function reviewImport(text: string, existing: RuleCollection, variables: readonly Variable[] = []): ImportReview {
  let input: unknown
  try { input = JSON.parse(text) } catch { throw new Error('This file is not readable JSON.') }
  const envelope = EnvelopeSchema.safeParse(input)
  if (!envelope.success) throw new Error('This is not a supported Overidify export. Check the file format and version.')
  // Only version 3 files can hold variables. Older files keep {{NAME}} text literal.
  const index = indexVariables(variables)
  const link = (values: unknown[]) => envelope.data.version === 3 ? values.map(value => linkImportedVariables(value, index)) : values
  const incomingHeaderRules = link(envelope.data.requestHeaderRules)
  const incomingNetworkRules = link(envelope.data.networkRules)
  const incoming = [...incomingHeaderRules, ...incomingNetworkRules]
  const counts = new Map<string, number>()
  for (const value of incoming) {
    if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string') {
      const id = value.id.toLowerCase()
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
  }
  const current = new Map([...existing.requestHeaderRules, ...existing.networkRules].map(rule => [rule.id.toLowerCase(), rule]))
  const result: ImportReview = { rules: { requestHeaderRules: [], networkRules: [] }, issues: [], overlaps: [], variables: { used: [], missing: [] } }
  function validate(value: unknown, network: boolean, index: number) {
    const name = value && typeof value === 'object' && 'name' in value && typeof value.name === 'string'
      ? value.name || `Rule ${index + 1}` : `Rule ${index + 1}`
    const parsed = network ? NetworkRuleSchema.safeParse(value) : RequestHeaderRuleSchema.safeParse(value)
    let message = parsed.success ? '' : parsed.error.issues.map(issue => `${issue.path.join('.') || 'rule'}: ${issue.message}`).join('; ')
    if (parsed.success) {
      const rule = parsed.data
      const draft = 'kind' in rule
        ? rule.kind === 'header-rule' ? HeaderRuleDraftSchema.safeParse(rule) : SwitchRuleDraftSchema.safeParse(rule)
        : NetworkRuleDraftSchema.safeParse(rule)
      if (!draft.success) message = draft.error.issues.map(issue => `${issue.path.join('.') || 'rule'}: ${issue.message}`).join('; ')
      if ('kind' in rule && rule.kind === 'switch-rule') {
        const ids = rule.options.map(option => option.id.toLowerCase())
        if (new Set(ids).size !== ids.length || !ids.includes(rule.selectedOptionId.toLowerCase())) {
          message = 'Switch Rule option IDs must be unique and the selected option must exist.'
        }
      }
      if ((counts.get(rule.id.toLowerCase()) ?? 0) > 1) message = 'This UUID appears more than once in the file.'
      const overlap = current.get(rule.id.toLowerCase())
      if (overlap && ruleType(overlap) !== ruleType(rule)) message = 'This UUID belongs to an existing rule of a different type.'
      if (!message) {
        if ('kind' in rule) result.rules.requestHeaderRules.push(rule)
        else result.rules.networkRules.push(rule)
        if (overlap) result.overlaps.push(rule)
      }
    }
    if (message) result.issues.push({ name, message })
  }
  incomingHeaderRules.forEach((value, position) => validate(value, false, position))
  incomingNetworkRules.forEach((value, position) => validate(value, true, position))
  const kept = [...result.rules.requestHeaderRules, ...result.rules.networkRules]
  const names = new Map<string, string>()
  for (const rule of kept) mapRuleTemplates(rule, value => { for (const token of templateTokens(value)) names.set(nameKey(token.name), token.name); return value })
  result.variables.used = [...names.values()].sort()
  result.variables.missing = result.variables.used.filter(name => !index.byName.has(nameKey(name)))
  result.rules.requestHeaderRules.sort((a, b) => a.order - b.order)
  result.rules.networkRules.sort((a, b) => a.order - b.order)
  return result
}

export function applyImport(existing: RuleCollection, review: ImportReview, action: ImportAction): RuleCollection {
  function merge<Rule extends TransferRule>(current: Rule[], incoming: Rule[]): Rule[] {
    const positions = new Map(current.map((rule, index) => [rule.id.toLowerCase(), index]))
    const output = structuredClone(current)
    for (const value of incoming) {
      const rule = structuredClone(value)
      const position = positions.get(rule.id.toLowerCase())
      if (position !== undefined && action === 'replace') {
        rule.id = current[position].id
        output[position] = rule
      } else {
        if (position !== undefined) {
          rule.id = crypto.randomUUID()
          if ('kind' in rule && rule.kind === 'switch-rule') {
            const selected = rule.selectedOptionId.toLowerCase()
            rule.options = rule.options.map(option => {
              const id = crypto.randomUUID()
              if (option.id.toLowerCase() === selected) rule.selectedOptionId = id
              return { ...option, id }
            })
          }
        }
        output.push(rule)
      }
    }
    return output.map((rule, order) => ({ ...rule, order }))
  }
  return { requestHeaderRules: merge(existing.requestHeaderRules, review.rules.requestHeaderRules),
    networkRules: merge(existing.networkRules, review.rules.networkRules) }
}
