import { getNetworkOverrides, NETWORK_STORAGE_KEY } from '../lib/network-storage'
import { networkOverridesForPage } from '../lib/network-overrides'
import { NetworkAppliedSchema, NetworkRuntimeMessageSchema } from '../lib/settings-messages'

const pageUrls = new Map<number, string>()

async function updateTab(tab: chrome.tabs.Tab) {
  if (tab.id === undefined) return false
  const entries = networkOverridesForPage(await getNetworkOverrides(), pageUrls.get(tab.id) ?? tab.url ?? '')
  const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id }).catch(() => null)
  const applied = await Promise.all((frames ?? [{ frameId: 0 }]).map(async frame => {
    try {
      const response = NetworkAppliedSchema.safeParse(await chrome.tabs.sendMessage(tab.id!, { type: 'update-network-overrides', entries }, { frameId: frame.frameId }))
      return response.success && response.data.ok && !response.data.needsReload
    } catch { return false }
  }))
  return entries.some(entry => entry.enabled) && applied.some(ok => !ok)
}

let syncing: Promise<number[]> | undefined
let requested = false
function sync(): Promise<number[]> {
  requested = true
  if (syncing) return syncing
  syncing = (async () => {
    let reloadTabIds: number[] = []
    try {
      while (requested) {
        requested = false
        const tabs = (await chrome.tabs.query({})).filter(tab => /^https?:\/\//.test(pageUrls.get(tab.id ?? -1) ?? tab.url ?? ''))
        const results = await Promise.all(tabs.map(async tab => await updateTab(tab) ? tab.id! : undefined))
        reloadTabIds = results.filter((id): id is number => id !== undefined)
      }
      return reloadTabIds
    } finally { syncing = undefined }
  })()
  return syncing
}
const requestSync = () => { void sync().catch(error => console.error('Failed to update network overrides.', error)) }

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const parsed = NetworkRuntimeMessageSchema.safeParse(message)
  if (!parsed.success) return
  if (parsed.data.type === 'get-network-overrides') {
    // Scope comes from the browser's tab metadata, never a page-supplied URL.
    const url = sender.tab?.id === undefined ? '' : pageUrls.get(sender.tab.id) ?? sender.tab.url ?? ''
    void getNetworkOverrides().then(entries => respond({ entries: networkOverridesForPage(entries, url) }), () => respond({ entries: [] }))
    return true
  }
  if (parsed.data.type === 'sync-network-overrides') {
    void sync().then(reloadTabIds => respond({ ok: true, reloadTabIds }), error => respond({ ok: false, error: String(error) }))
    return true
  }
})
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && NETWORK_STORAGE_KEY in changes) requestSync() })
chrome.webNavigation.onBeforeNavigate.addListener(({ tabId, frameId, url }) => { if (frameId === 0) pageUrls.set(tabId, url) })
chrome.webNavigation.onCommitted.addListener(({ tabId, frameId, url }) => {
  if (frameId === 0) { pageUrls.set(tabId, url); requestSync() }
})
chrome.webNavigation.onHistoryStateUpdated.addListener(({ tabId, frameId, url }) => {
  if (frameId === 0) { pageUrls.set(tabId, url); requestSync() }
})
chrome.webNavigation.onErrorOccurred.addListener(({ tabId, frameId }) => { if (frameId === 0) pageUrls.delete(tabId) })
chrome.tabs.onUpdated.addListener((tabId, change) => { if (change.url) { pageUrls.set(tabId, change.url); requestSync() } })
chrome.tabs.onRemoved.addListener(tabId => pageUrls.delete(tabId))
chrome.tabs.onReplaced.addListener((_added, removed) => pageUrls.delete(removed))
chrome.runtime.onInstalled.addListener(requestSync)
chrome.runtime.onStartup.addListener(requestSync)
