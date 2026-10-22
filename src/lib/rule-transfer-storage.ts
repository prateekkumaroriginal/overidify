import { ActivationResultSchema } from './settings-messages.ts'
import type { RuleCollection, TransferRule } from './rule-transfer.ts'
import { getRequestHeaderRules, REQUEST_HEADER_STORAGE_KEY } from './request-header-storage.ts'
import { getNetworkRules, NETWORK_STORAGE_KEY } from './network-storage.ts'

export type TransferActivation = { ok: boolean; reloadTabIds: number[]; error?: string }
const isPreview = () => import.meta.env?.DEV && !globalThis.chrome?.storage?.local

async function withRuleStorageLocks<T>(action: () => Promise<T>): Promise<T> {
  return await navigator.locks.request(REQUEST_HEADER_STORAGE_KEY, async () =>
    await navigator.locks.request(NETWORK_STORAGE_KEY, action))
}

export async function getSavedRules(): Promise<RuleCollection> {
  return withRuleStorageLocks(async () => {
    const [requestHeaderRules, networkRules] = await Promise.all([getRequestHeaderRules(), getNetworkRules()])
    return { requestHeaderRules, networkRules }
  })
}

export async function duplicateSavedRule(id: string) {
  const saved = await withRuleStorageLocks(async () => {
    const [requestHeaderRules, networkRules] = await Promise.all([getRequestHeaderRules(), getNetworkRules()])
    const all = [...requestHeaderRules, ...networkRules]
    const source = all.find(rule => rule.id === id)
    if (!source) throw new Error('This rule no longer exists. Refresh the list and try again.')

    const base = source.name.trim().replace(/(?:\s+\(copy(?: \d+)?\))+$/i, '').trim() || 'Untitled rule'
    const names = new Set(all.map(rule => rule.name.trim().toLowerCase()))
    let number = 1
    let name = `${base} (copy)`
    while (names.has(name.toLowerCase())) name = `${base} (copy ${++number})`
    const copy: TransferRule = { ...structuredClone(source), id: crypto.randomUUID(), name, enabled: false }
    if ('kind' in copy && copy.kind === 'switch-rule') {
      const selected = copy.selectedOptionId
      copy.options = copy.options.map(option => {
        const id = crypto.randomUUID()
        if (option.id === selected) copy.selectedOptionId = id
        return { ...option, id }
      })
    }
    const rules: RuleCollection = 'kind' in copy ? {
      requestHeaderRules: requestHeaderRules.flatMap(rule => rule.id === id ? [rule, copy] : [rule]).map((rule, order) => ({ ...rule, order })),
      networkRules,
    } : {
      requestHeaderRules,
      networkRules: networkRules.flatMap(rule => rule.id === id ? [rule, copy] : [rule]).map((rule, order) => ({ ...rule, order })),
    }
    copy.order = source.order + 1
    await persistRules(rules)
    return { rules, copy }
  })
  return { ...saved, activation: await activateImportedRules() }
}

export async function activateImportedRules(): Promise<TransferActivation> {
  if (isPreview()) return { ok: true, reloadTabIds: [] }
  const results = await Promise.allSettled(['sync-request-header-rules', 'sync-network-rules'].map(async type => chrome.runtime.sendMessage({ type })))
  const reloadTabIds = new Set<number>()
  const errors: string[] = []
  for (const result of results) {
    const parsed = result.status === 'fulfilled' ? ActivationResultSchema.safeParse(result.value) : null
    if (parsed?.success && parsed.data.ok) {
      for (const id of parsed.data.reloadTabIds ?? []) reloadTabIds.add(id)
    } else {
      errors.push(parsed?.success && !parsed.data.ok ? parsed.data.error ?? 'Activation was not confirmed.' : 'The extension did not confirm activation.')
    }
  }
  return { ok: errors.length === 0, reloadTabIds: [...reloadTabIds], error: errors.length ? errors.join(' ') : undefined }
}

export async function saveImportedRules(rules: RuleCollection): Promise<TransferActivation> {
  await withRuleStorageLocks(() => persistRules(rules))
  return activateImportedRules()
}

export async function persistRuleDeletion(selectedIds: ReadonlySet<string>) {
  const ids = new Set(selectedIds)
  return withRuleStorageLocks(async () => {
    const [requestHeaderRules, networkRules] = await Promise.all([getRequestHeaderRules(), getNetworkRules()])
    const rules = {
      requestHeaderRules: requestHeaderRules.filter(rule => !ids.has(rule.id)),
      networkRules: networkRules.filter(rule => !ids.has(rule.id)),
    }
    const deletedCount = requestHeaderRules.length + networkRules.length
      - rules.requestHeaderRules.length - rules.networkRules.length
    if (deletedCount) await persistRules(rules)
    return { rules, deletedCount }
  })
}

export async function deleteSavedRules(selectedIds: ReadonlySet<string>) {
  const result = await persistRuleDeletion(selectedIds)
  const activation = result.deletedCount ? await activateImportedRules() : { ok: true, reloadTabIds: [] }
  return { ...result, activation }
}

async function persistRules(rules: RuleCollection): Promise<void> {
  if (isPreview()) {
    const keys = ['requestHeaderRules', 'networkRules'] as const
    const previous = keys.map(key => localStorage.getItem(key))
    try {
      for (const key of keys) localStorage.setItem(key, JSON.stringify(rules[key]))
    } catch (error) {
      keys.forEach((key, index) => {
        if (previous[index] === null) localStorage.removeItem(key)
        else localStorage.setItem(key, previous[index]!)
      })
      throw error
    }
    for (const event of ['request-header-rules-updated', 'network-rules-updated']) window.dispatchEvent(new Event(event))
  } else {
    // One write keeps the two rule collections together; activation is a separate result.
    await chrome.storage.local.set(rules)
  }
}
