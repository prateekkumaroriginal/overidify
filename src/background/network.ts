import { getNetworkOverrides, NETWORK_STORAGE_KEY } from '../lib/network-storage'
import { networkOverridesForPage, normalizeNetworkOverrides } from '../lib/network-overrides'
import { matchesPageDomain } from '../lib/pattern'
import { NetworkActiveTabsSchema, NetworkAppliedSchema, NetworkRuntimeMessageSchema } from '../lib/settings-messages'

const pageUrls = new Map<number, string>()
const possiblyActiveTabs = new Set<number>()
const previousPatterns = new Set<string>()
const ACTIVE_TABS_KEY = 'networkOverrideActiveTabs'
const activationReady = chrome.storage.session.get(ACTIVE_TABS_KEY).then(stored => {
  const parsed = NetworkActiveTabsSchema.safeParse(stored[ACTIVE_TABS_KEY])
  if (parsed.success) for (const id of parsed.data) possiblyActiveTabs.add(id)
})
let activationWrite: Promise<void> = Promise.resolve()

async function rememberActiveTab(tabId: number, active: boolean) {
  await activationReady
  if (active) possiblyActiveTabs.add(tabId)
  else possiblyActiveTabs.delete(tabId)
  // Serialize writes from concurrent tab updates. Session storage survives
  // worker suspension, and contains no user settings or response bodies.
  activationWrite = activationWrite.catch(() => undefined).then(() => chrome.storage.session.set({ [ACTIVE_TABS_KEY]: [...possiblyActiveTabs] }))
  await activationWrite
}

function forgetTab(tabId: number) {
  pageUrls.delete(tabId)
  void rememberActiveTab(tabId, false).catch(error => console.error('Failed to clear network activation state.', error))
}

async function updateTab(tab: chrome.tabs.Tab, priorPatterns: string[]) {
  if (tab.id === undefined) return false
  await activationReady
  const url = pageUrls.get(tab.id) ?? tab.url ?? ''
  const entries = networkOverridesForPage(await getNetworkOverrides(), url)
  const enabled = entries.some(entry => entry.enabled)
  if (enabled || priorPatterns.some(pattern => matchesPageDomain(pattern, url))) await rememberActiveTab(tab.id, true)
  const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id }).catch(() => null)
  const applied = await Promise.all((frames?.length ? frames : [{ frameId: 0 }]).map(async frame => {
    try {
      const response = NetworkAppliedSchema.safeParse(await chrome.tabs.sendMessage(tab.id!, { type: 'update-network-overrides', entries }, { frameId: frame.frameId }))
      return response.success && response.data.ok && !response.data.needsReload
    } catch { return false }
  }))
  const failed = applied.some(ok => !ok)
  const needsReload = possiblyActiveTabs.has(tab.id) && failed
  if (!enabled && !failed) await rememberActiveTab(tab.id, false)
  return needsReload
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
        const priorPatterns = [...previousPatterns]
        previousPatterns.clear()
        const tabs = (await chrome.tabs.query({})).filter(tab => /^https?:\/\//.test(pageUrls.get(tab.id ?? -1) ?? tab.url ?? ''))
        const results = await Promise.all(tabs.map(async tab => await updateTab(tab, priorPatterns) ? tab.id! : undefined))
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
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !(NETWORK_STORAGE_KEY in changes)) return
  // oldValue also recovers possible stale activation after a worker restart.
  for (const entry of normalizeNetworkOverrides(changes[NETWORK_STORAGE_KEY].oldValue)) {
    if (entry.enabled) previousPatterns.add(entry.url)
  }
  requestSync()
})
chrome.webNavigation.onBeforeNavigate.addListener(({ tabId, frameId, url }) => { if (frameId === 0) pageUrls.set(tabId, url) })
chrome.webNavigation.onCommitted.addListener(({ tabId, frameId, url }) => {
  if (frameId === 0) {
    pageUrls.set(tabId, url)
    void rememberActiveTab(tabId, false).then(requestSync).catch(error => console.error('Failed to reset network activation state.', error))
  }
})
chrome.webNavigation.onHistoryStateUpdated.addListener(({ tabId, frameId, url }) => {
  if (frameId === 0) { pageUrls.set(tabId, url); requestSync() }
})
chrome.webNavigation.onErrorOccurred.addListener(({ tabId, frameId }) => { if (frameId === 0) pageUrls.delete(tabId) })
chrome.tabs.onUpdated.addListener((tabId, change) => { if (change.url) { pageUrls.set(tabId, change.url); requestSync() } })
chrome.tabs.onRemoved.addListener(forgetTab)
chrome.tabs.onReplaced.addListener((_added, removed) => forgetTab(removed))
chrome.runtime.onInstalled.addListener(requestSync)
chrome.runtime.onStartup.addListener(requestSync)
