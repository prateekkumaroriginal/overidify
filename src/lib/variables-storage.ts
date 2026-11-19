import { normalizeVariables, planVariablesSave, VARIABLES_STORAGE_KEY } from './variables.ts'
import type { ReferenceUsage, Variable } from './variables.ts'
import { activateImportedRules, withRuleStorageLocks } from './rule-transfer-storage.ts'
import type { TransferActivation } from './rule-transfer-storage.ts'
import { getRequestHeaderRules, REQUEST_HEADER_STORAGE_KEY } from './request-header-storage.ts'
import { getNetworkRules, NETWORK_STORAGE_KEY } from './network-storage.ts'
import { normalizeRequestHeaderRules } from './request-header-rules.ts'
import { normalizeNetworkRules } from './network-rules.ts'

export { VARIABLES_STORAGE_KEY }
const isPreview = () => import.meta.env?.DEV && !globalThis.chrome?.storage?.local

export async function getVariables(): Promise<Variable[]> {
  const data = isPreview()
    ? JSON.parse(localStorage.getItem(VARIABLES_STORAGE_KEY) ?? '[]')
    : (await chrome.storage.local.get(VARIABLES_STORAGE_KEY))[VARIABLES_STORAGE_KEY]
  return normalizeVariables(data)
}

export function subscribeToVariables(onChange: (variables: Variable[]) => void): () => void {
  if (isPreview()) {
    const update = () => { void getVariables().then(onChange).catch(() => undefined) }
    const storage = (event: StorageEvent) => { if (event.key === VARIABLES_STORAGE_KEY || event.key === null) update() }
    window.addEventListener('storage', storage)
    window.addEventListener('variables-updated', update)
    return () => { window.removeEventListener('storage', storage); window.removeEventListener('variables-updated', update) }
  }
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && VARIABLES_STORAGE_KEY in changes) onChange(normalizeVariables(changes[VARIABLES_STORAGE_KEY].newValue))
  }
  chrome.storage.onChanged.addListener(listener)
  return () => chrome.storage.onChanged.removeListener(listener)
}

export type VariablesSaveResult =
  | { status: 'invalid'; errors: Record<string, string> }
  | { status: 'confirm'; missing: Map<string, ReferenceUsage[]> }
  | { status: 'saved'; variables: Variable[]; activation: TransferActivation }

export class VariablesStorageError extends Error {
  constructor() {
    super('Variables were not saved. Your previous variables are still in use.')
    this.name = 'VariablesStorageError'
  }
}

/**
 * Saves a Variables page draft under the header, Network, and variables locks,
 * in that order. Renamed references are rewritten in the same storage write.
 */
export async function saveVariables({ baseline, draft, confirmDeletes = false }: { baseline: Variable[]; draft: Variable[]; confirmDeletes?: boolean }): Promise<VariablesSaveResult> {
  const result = await withRuleStorageLocks(() => navigator.locks.request(VARIABLES_STORAGE_KEY, async (): Promise<VariablesSaveResult> => {
    const [stored, requestHeaderRules, networkRules] = await Promise.all([getVariables(), getRequestHeaderRules(), getNetworkRules()])
    const plan = planVariablesSave({ stored, baseline, draft, rules: { requestHeaderRules, networkRules } })
    if (!plan.ok) return { status: 'invalid', errors: plan.errors }
    if (plan.newlyMissing.size && !confirmDeletes) return { status: 'confirm', missing: plan.newlyMissing }
    const changes: Record<string, unknown> = {}
    if (plan.variablesChanged) changes[VARIABLES_STORAGE_KEY] = plan.variables
    if (plan.headerChanged) changes[REQUEST_HEADER_STORAGE_KEY] = normalizeRequestHeaderRules(plan.rules.requestHeaderRules)
    if (plan.networkChanged) changes[NETWORK_STORAGE_KEY] = normalizeNetworkRules(plan.rules.networkRules)
    if (Object.keys(changes).length) {
      try { await write(changes) } catch { throw new VariablesStorageError() }
    }
    return { status: 'saved', variables: plan.variables, activation: { ok: true, reloadTabIds: [] } }
  }))
  if (result.status !== 'saved') return result
  return { ...result, activation: await activateImportedRules() }
}

async function write(changes: Record<string, unknown>) {
  if (!isPreview()) {
    // One write keeps renamed references and the variables together.
    await chrome.storage.local.set(changes)
    return
  }
  const previous = Object.keys(changes).map(key => [key, localStorage.getItem(key)] as const)
  try { for (const [key, value] of Object.entries(changes)) localStorage.setItem(key, JSON.stringify(value)) }
  catch (error) {
    for (const [key, value] of previous) { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value) }
    throw error
  }
  for (const event of ['variables-updated', 'request-header-rules-updated', 'network-rules-updated']) window.dispatchEvent(new Event(event))
}
