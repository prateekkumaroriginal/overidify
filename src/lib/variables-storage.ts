import { NAME_DUPLICATE_MESSAGE, nameKey, normalizeVariables, variableNameError, VARIABLES_STORAGE_KEY } from './variables.ts'
import type { Variable } from './variables.ts'

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

/** Writes several storage keys in one change, so variables and the rules they turn off stay together. */
export async function writeStorage(changes: Record<string, unknown>) {
  if (!isPreview()) { await chrome.storage.local.set(changes); return }
  const previous = Object.keys(changes).map(key => [key, localStorage.getItem(key)] as const)
  try { for (const [key, value] of Object.entries(changes)) localStorage.setItem(key, JSON.stringify(value)) }
  catch (error) {
    for (const [key, value] of previous) { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value) }
    throw error
  }
  const events: Record<string, string> = { variables: 'variables-updated', requestHeaderRules: 'request-header-rules-updated', networkRules: 'network-rules-updated' }
  for (const key of Object.keys(changes)) if (events[key]) window.dispatchEvent(new Event(events[key]))
}

export type CreateVariableResult = { ok: true; variable: Variable } | { ok: false; error: string }

/** Adds one variable from a rule field's suggestions. Rules are not changed. */
export async function createVariable(input: Omit<Variable, 'id'>): Promise<CreateVariableResult> {
  const error = variableNameError(input.name)
  if (error) return { ok: false, error }
  return navigator.locks.request(VARIABLES_STORAGE_KEY, async (): Promise<CreateVariableResult> => {
    const stored = await getVariables()
    if (stored.some(variable => nameKey(variable.name) === nameKey(input.name))) return { ok: false, error: NAME_DUPLICATE_MESSAGE }
    const variable = { id: crypto.randomUUID(), ...input }
    try { await writeStorage({ [VARIABLES_STORAGE_KEY]: [...stored, variable] }) }
    catch { return { ok: false, error: 'The variable was not saved. Try again.' } }
    return { ok: true, variable }
  })
}

