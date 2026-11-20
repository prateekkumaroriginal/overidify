import { prepareRulesForSave } from './rule-resolution.ts'
import { NAME_DUPLICATE_MESSAGE, nameKey, sortVariables, variableNameError } from './variables.ts'
import type { Variable } from './variables.ts'
import type { NetworkRule } from './network-rules.ts'
import type { RequestHeaderRule } from './types.ts'

type Rules = { requestHeaderRules: RequestHeaderRule[]; networkRules: NetworkRule[] }
export type TurnedOffRule = { id: string; name: string; type: 'header-rule' | 'switch-rule' | 'network-rule' }
export type VariablesSavePlan =
  | { ok: false; errors: Record<string, string> }
  | { ok: true; variables: Variable[]; rules: Rules; turnedOff: TurnedOffRule[]; variablesChanged: boolean; headerChanged: boolean; networkChanged: boolean }

const same = (left: Variable, right: Variable) => left.name === right.name && left.value === right.value && left.secret === right.secret

/**
 * Applies a Variables page draft to the latest saved list by variable ID. Rows the draft did not
 * change keep edits saved elsewhere. Rules follow renames, and rules the new variables leave unable to run are turned off.
 */
export function planVariablesSave({ stored, baseline, draft, rules }: { stored: Variable[]; baseline: Variable[]; draft: Variable[]; rules: Rules }): VariablesSavePlan {
  const baselineById = new Map(baseline.map(row => [row.id, row]))
  const draftById = new Map(draft.map(row => [row.id, row]))
  const storedIds = new Set(stored.map(row => row.id))
  const edited = (row: Variable) => { const base = baselineById.get(row.id); return !base || !same(base, row) }
  const variables: Variable[] = []
  for (const current of stored) {
    const row = draftById.get(current.id)
    if (row) variables.push(edited(row) ? { ...row } : current)
    else if (!baselineById.has(current.id)) variables.push(current)
  }
  // A row edited here but deleted elsewhere is saved again.
  for (const row of draft) if (!storedIds.has(row.id) && edited(row)) variables.push({ ...row })

  const errors: Record<string, string> = {}
  const owners = new Map<string, string>()
  for (const row of variables) {
    const error = variableNameError(row.name)
    if (error && draftById.has(row.id)) errors[row.id] = error
    const owner = owners.get(nameKey(row.name))
    if (owner !== undefined) errors[draftById.has(row.id) ? row.id : owner] = NAME_DUPLICATE_MESSAGE
    owners.set(nameKey(row.name), row.id)
  }
  if (Object.keys(errors).length) return { ok: false, errors }

  const header = prepareRulesForSave(rules.requestHeaderRules, variables)
  const network = prepareRulesForSave(rules.networkRules, variables)
  const turnedOff = [...header.turnedOff.map(rule => ({ id: rule.id, name: rule.name, type: rule.kind })),
    ...network.turnedOff.map(rule => ({ id: rule.id, name: rule.name, type: 'network-rule' as const }))]
  return { ok: true, variables, rules: { requestHeaderRules: header.rules, networkRules: network.rules }, turnedOff,
    variablesChanged: JSON.stringify(sortVariables(variables)) !== JSON.stringify(sortVariables(stored)),
    headerChanged: header.changed, networkChanged: network.changed }
}
