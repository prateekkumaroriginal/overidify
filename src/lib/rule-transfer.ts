import * as z from 'zod/mini'
import { RequestHeaderRuleSchema, HeaderRuleDraftSchema, SwitchRuleDraftSchema } from './request-header-schemas.ts'
import { NetworkRuleSchema, NetworkRuleDraftSchema } from './network-schemas.ts'
import type { RequestHeaderRule } from './types.ts'
import type { NetworkRule } from './network-rules.ts'

export type RuleCollection = { requestHeaderRules: RequestHeaderRule[]; networkRules: NetworkRule[] }
export type TransferRule = RequestHeaderRule | NetworkRule
export type ImportIssue = { name: string; message: string }
export type ImportReview = { rules: RuleCollection; issues: ImportIssue[]; overlaps: TransferRule[] }
export type ImportAction = 'replace' | 'add'

const EnvelopeSchema = z.object({
  format: z.literal('overidify'), version: z.literal(1),
  requestHeaderRules: z.array(z.unknown()), networkRules: z.array(z.unknown()),
})
export function ruleType(rule: TransferRule): 'header-rule' | 'switch-rule' | 'network-rule' {
  return 'kind' in rule ? rule.kind : 'network-rule'
}

export function exportRules(rules: RuleCollection): string {
  return JSON.stringify({ format: 'overidify', version: 1, ...rules }, null, 2)
}

export function reviewImport(text: string, existing: RuleCollection): ImportReview {
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
  const result: ImportReview = { rules: { requestHeaderRules: [], networkRules: [] }, issues: [], overlaps: [] }
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
  envelope.data.requestHeaderRules.forEach((value, index) => validate(value, false, index))
  envelope.data.networkRules.forEach((value, index) => validate(value, true, index))
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
