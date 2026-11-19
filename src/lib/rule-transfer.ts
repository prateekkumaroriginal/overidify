import * as z from 'zod/mini'
import { RequestHeaderRuleSchema, HeaderRuleDraftSchema, SwitchRuleDraftSchema } from './request-header-schemas.ts'
import { NetworkRuleSchema, NetworkRuleDraftSchema } from './network-schemas.ts'
import type { RequestHeaderRule } from './types.ts'
import type { NetworkRule } from './network-rules.ts'
import { appendText, compareNames, displayText, fromParts, normalizePersistedTemplate, templateParts, trimTemplateEdges } from './templates.ts'
import type { TemplateText } from './templates.ts'
import { collectVariableReferences, mapRuleTemplates } from './variables.ts'

export type RuleCollection = { requestHeaderRules: RequestHeaderRule[]; networkRules: NetworkRule[] }
export type TransferRule = RequestHeaderRule | NetworkRule
export type ImportIssue = { name: string; message: string }
/** Variable names the valid imported rules use; values are never read from a file. */
export type ImportVariables = { used: string[]; missing: string[] }
export type ImportReview = { rules: RuleCollection; issues: ImportIssue[]; overlaps: TransferRule[]; variables: ImportVariables }
export type ImportAction = 'replace' | 'add'

// Only the envelope fields are read. Any other key, such as a variables list, is ignored.
const EnvelopeSchema = z.object({
  format: z.literal('overidify'), version: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  requestHeaderRules: z.array(z.unknown()), networkRules: z.array(z.unknown()),
})

function containsTemplate(rule: TransferRule) {
  let found = false
  mapRuleTemplates(rule, value => { found ||= typeof value !== 'string'; return value })
  return found
}

/** Copies keep references: "{{ENV}} admin" becomes "{{ENV}} admin (copy)". */
export function copyName(name: TemplateText, existing: TemplateText[]): TemplateText {
  const parts = templateParts(trimTemplateEdges(name))
  const last = parts.length - 1
  if (typeof parts[last] === 'string') parts[last] = (parts[last] as string).replace(/(?:\s+\(copy(?: \d+)?\))+$/i, '').trimEnd()
  let base = fromParts(parts)
  if (!displayText(base)) base = 'Untitled rule'
  const names = new Set(existing.map(value => displayText(trimTemplateEdges(value)).toLowerCase()))
  let number = 1
  let copy = appendText(base, ' (copy)')
  while (names.has(displayText(copy).toLowerCase())) copy = appendText(base, ` (copy ${++number})`)
  return copy
}
export function ruleType(rule: TransferRule): 'header-rule' | 'switch-rule' | 'network-rule' {
  return 'kind' in rule ? rule.kind : 'network-rule'
}

/** Exports rule templates exactly as stored. Variable values are never exported. */
export function exportRules(rules: RuleCollection): string {
  const all = [...rules.requestHeaderRules, ...rules.networkRules]
  const version = all.some(containsTemplate) ? 3 : all.some(rule => Array.isArray(rule.url)) ? 2 : 1
  return JSON.stringify({ format: 'overidify', version, requestHeaderRules: rules.requestHeaderRules, networkRules: rules.networkRules }, null, 2)
}

export function reviewImport(text: string, existing: RuleCollection, localVariableNames: Iterable<string> = []): ImportReview {
  let input: unknown
  try { input = JSON.parse(text) } catch { throw new Error('This file is not readable JSON.') }
  const envelope = EnvelopeSchema.safeParse(input)
  if (!envelope.success) throw new Error('This is not a supported Overidify export. Check the file format and version.')
  const incoming = [...envelope.data.requestHeaderRules, ...envelope.data.networkRules]
  const counts = new Map<string, number>()
  for (const value of incoming) {
    if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string') {
      const id = value.id.toLowerCase()
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
  }
  const current = new Map([...existing.requestHeaderRules, ...existing.networkRules].map(rule => [rule.id.toLowerCase(), rule]))
  const result: ImportReview = { rules: { requestHeaderRules: [], networkRules: [] }, issues: [], overlaps: [], variables: { used: [], missing: [] } }
  const version = envelope.data.version
  function validate(value: unknown, network: boolean, index: number) {
    const label = value && typeof value === 'object' && 'name' in value ? displayText(normalizePersistedTemplate(value.name)) : ''
    const name = label || `Rule ${index + 1}`
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
      if (version < 3) {
        // The shape has been validated. Inspect the input so canonicalization
        // cannot hide an object in a field that used to accept only a string.
        const raw = { ...value as TransferRule }
        if (network) Reflect.deleteProperty(raw, 'kind')
        if (containsTemplate(raw)) message = 'Variable references need export format version 3.'
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
  envelope.data.requestHeaderRules.forEach((value, index) => validate(value, false, index))
  envelope.data.networkRules.forEach((value, index) => validate(value, true, index))
  result.rules.requestHeaderRules.sort((a, b) => a.order - b.order)
  result.rules.networkRules.sort((a, b) => a.order - b.order)
  // References bind to local variables by exact, case-sensitive name.
  const local = new Set(localVariableNames)
  const used = [...collectVariableReferences(result.rules).keys()].sort(compareNames)
  result.variables = { used: used.filter(name => local.has(name)), missing: used.filter(name => !local.has(name)) }
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
