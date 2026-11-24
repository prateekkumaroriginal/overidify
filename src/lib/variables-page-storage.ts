import { getVariables, VARIABLES_STORAGE_KEY, writeStorage } from './variables-storage.ts'
import type { Variable } from './variables.ts'
import { planVariablesSave } from './variables-save.ts'
import type { TurnedOffRule } from './variables-save.ts'
import { getRequestHeaderRules, REQUEST_HEADER_STORAGE_KEY } from './request-header-storage.ts'
import { getNetworkRules, NETWORK_STORAGE_KEY } from './network-storage.ts'
import { activateImportedRules, withRuleStorageLocks } from './rule-transfer-storage.ts'
import type { TransferActivation } from './rule-transfer-storage.ts'
import type { RuleCollection } from './rule-transfer.ts'

export type VariablesSaveResult =
  | { status: 'invalid'; errors: Record<string, string> }
  | { status: 'confirm'; turnedOff: TurnedOffRule[] }
  | { status: 'saved'; variables: Variable[]; rules: RuleCollection; turnedOff: TurnedOffRule[]; activation: TransferActivation }

export const VARIABLES_SAVE_FAILED = 'Variables were not saved. Your previous variables are still in use.'

/**
 * Saves a Variables page draft under the header, Network, and variables locks, in that order.
 * Rules the change turns off are written in the same storage write, after confirmation.
 * `confirmedTurnOff` lists the rule IDs the user agreed to turn off. Any other rule that would turn off asks again.
 * A `draft` function builds the draft from the saved variables and rules inside the locks; the saved variables serve as the baseline.
 * Callers activate the result; the background worker can't message itself, so MCP activates directly.
 */
export async function writeVariables(input: { confirmedTurnOff?: string[] } & ({ baseline: Variable[]; draft: Variable[] } | { draft: (stored: Variable[], rules: RuleCollection) => Variable[] })): Promise<VariablesSaveResult> {
  const { confirmedTurnOff = [] } = input
  return withRuleStorageLocks(() => navigator.locks.request(VARIABLES_STORAGE_KEY, async (): Promise<VariablesSaveResult> => {
    const [stored, requestHeaderRules, networkRules] = await Promise.all([getVariables(), getRequestHeaderRules(), getNetworkRules()])
    const baseline = 'baseline' in input ? input.baseline : stored
    const draft = typeof input.draft === 'function' ? input.draft(stored, { requestHeaderRules, networkRules }) : input.draft
    const plan = planVariablesSave({ stored, baseline, draft, rules: { requestHeaderRules, networkRules } })
    if (!plan.ok) return { status: 'invalid', errors: plan.errors }
    if (plan.turnedOff.some(rule => !confirmedTurnOff.includes(rule.id))) return { status: 'confirm', turnedOff: plan.turnedOff }
    const changes: Record<string, unknown> = {}
    if (plan.variablesChanged) changes[VARIABLES_STORAGE_KEY] = plan.variables
    if (plan.headerChanged) changes[REQUEST_HEADER_STORAGE_KEY] = plan.rules.requestHeaderRules
    if (plan.networkChanged) changes[NETWORK_STORAGE_KEY] = plan.rules.networkRules
    if (Object.keys(changes).length) {
      try { await writeStorage(changes) } catch { throw new Error(VARIABLES_SAVE_FAILED) }
    }
    return { status: 'saved', variables: plan.variables, rules: plan.rules, turnedOff: plan.turnedOff, activation: { ok: true, reloadTabIds: [] } }
  }))
}

export async function saveVariables(input: { baseline: Variable[]; draft: Variable[]; confirmedTurnOff?: string[] }): Promise<VariablesSaveResult> {
  const result = await writeVariables(input)
  return result.status === 'saved' ? { ...result, activation: await activateImportedRules() } : result
}
