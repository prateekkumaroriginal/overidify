import { ActivationResultSchema } from './settings-messages.ts'
import type { RuleCollection } from './rule-transfer.ts'
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
  await withRuleStorageLocks(() => persistImportedRules(rules))
  return activateImportedRules()
}

async function persistImportedRules(rules: RuleCollection): Promise<void> {
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
