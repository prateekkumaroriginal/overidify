import { normalizeNetworkRules, validateNetworkRule } from './network-rules'
import type { NetworkRule } from './network-rules'
import { ActivationResultSchema } from './settings-messages'
export type { NetworkApplyResult } from './settings-messages'

export const NETWORK_STORAGE_KEY = 'networkRules'
const isPreview = () => import.meta.env.DEV && !globalThis.chrome?.storage?.local

export async function updateNetworkRules(update: (rules: NetworkRule[]) => NetworkRule[]) {
  return navigator.locks.request(NETWORK_STORAGE_KEY, async () =>
    saveNetworkRules(update(await getNetworkRules())),
  )
}

export async function getNetworkRules(): Promise<NetworkRule[]> {
  const data = isPreview()
    ? JSON.parse(localStorage.getItem(NETWORK_STORAGE_KEY) ?? '[]')
    : (await chrome.storage.local.get(NETWORK_STORAGE_KEY))[NETWORK_STORAGE_KEY]
  return normalizeNetworkRules(data)
}

async function saveNetworkRules(entries: NetworkRule[]): Promise<{ entries: NetworkRule[]; reloadTabIds: number[] }> {
  for (const entry of entries) {
    if (entry.enabled) {
      const error = validateNetworkRule(entry)
      if (error) throw new Error(error)
    }
  }
  const normalized = normalizeNetworkRules(entries)
  if (isPreview()) {
    localStorage.setItem(NETWORK_STORAGE_KEY, JSON.stringify(normalized))
    window.dispatchEvent(new Event('network-rules-updated'))
    return { entries: normalized, reloadTabIds: [] }
  }
  await chrome.storage.local.set({ [NETWORK_STORAGE_KEY]: normalized })
  const parsed = ActivationResultSchema.safeParse(await chrome.runtime.sendMessage({ type: 'sync-network-rules' }))
  if (!parsed.success || !parsed.data.ok) throw new Error((parsed.success && !parsed.data.ok ? parsed.data.error : undefined) ?? 'Settings were saved, but activation was not confirmed. Reload the extension and website.')
  return { entries: normalized, reloadTabIds: parsed.data.reloadTabIds ?? [] }
}

export function subscribeToNetworkRules(onChange: (entries: NetworkRule[]) => void): () => void {
  if (isPreview()) {
    const update = () => { void getNetworkRules().then(onChange).catch(() => undefined) }
    const storage = (event: StorageEvent) => { if (event.key === NETWORK_STORAGE_KEY || event.key === null) update() }
    window.addEventListener('storage', storage)
    window.addEventListener('network-rules-updated', update)
    return () => { window.removeEventListener('storage', storage); window.removeEventListener('network-rules-updated', update) }
  }
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && NETWORK_STORAGE_KEY in changes) onChange(normalizeNetworkRules(changes[NETWORK_STORAGE_KEY].newValue))
  }
  chrome.storage.onChanged.addListener(listener)
  return () => chrome.storage.onChanged.removeListener(listener)
}
