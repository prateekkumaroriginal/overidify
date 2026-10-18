import { getNetworkRules, NETWORK_STORAGE_KEY } from '../lib/network-storage'
import { networkRulesForPage, normalizeNetworkRules } from '../lib/network-rules'
import { matchesPageDomain } from '../lib/pattern'
import { NetworkActiveTabsSchema, NetworkBridgeFramesSchema, NetworkAppliedSchema, NetworkRuntimeMessageSchema } from '../lib/settings-messages'

const pageUrls = new Map<number, string>()
const possiblyActiveTabs = new Set<number>()
const previousPatterns = new Set<string>()
const ACTIVE_TABS_KEY = 'networkRuleActiveTabs'
const BRIDGE_FRAMES_KEY = 'networkRuleBridgeFrames'
const bridgeFrames = new Map<number, Map<number, string>>()
const activationReady = chrome.storage.session.get([ACTIVE_TABS_KEY, BRIDGE_FRAMES_KEY]).then(stored => {
  const parsed = NetworkActiveTabsSchema.safeParse(stored[ACTIVE_TABS_KEY])
  if (parsed.success) for (const id of parsed.data) possiblyActiveTabs.add(id)
  const frames = NetworkBridgeFramesSchema.safeParse(stored[BRIDGE_FRAMES_KEY])
  if (frames.success) for (const frame of frames.data) bridgeFrames.set(frame.tabId, new Map(frame.frames.map(item => [item.frameId, item.documentId])))
})
let activationWrite: Promise<void> = Promise.resolve()

async function rememberActiveTab(tabId: number, active: boolean) {
  await activationReady
  if (active) possiblyActiveTabs.add(tabId)
  else possiblyActiveTabs.delete(tabId)
  // Serialize writes from concurrent tab updates. Session storage survives
  // worker suspension, and contains no user settings or response bodies.
  activationWrite = activationWrite.catch(() => undefined).then(() => chrome.storage.session.set({
    [ACTIVE_TABS_KEY]: [...possiblyActiveTabs],
    [BRIDGE_FRAMES_KEY]: [...bridgeFrames].map(([tabId, frames]) => ({ tabId, frames: [...frames].map(([frameId, documentId]) => ({ frameId, documentId })) })),
  }))
  await activationWrite
}

function forgetTab(tabId: number) {
  pageUrls.delete(tabId)
  bridgeFrames.delete(tabId)
  void rememberActiveTab(tabId, false).catch(error => console.error('Failed to clear network activation state.', error))
}

async function updateTab(tab: chrome.tabs.Tab, priorPatterns: string[]) {
  if (tab.id === undefined) return false
  await activationReady
  const url = pageUrls.get(tab.id) ?? tab.url ?? ''
  const entries = networkRulesForPage(await getNetworkRules(), url)
  const enabled = entries.some(entry => entry.enabled)
  if (enabled || priorPatterns.some(pattern => matchesPageDomain(pattern, url))) await rememberActiveTab(tab.id, true)
  const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id }).catch(() => null)
  // Register frames only after their MAIN script's ready handshake. An isolated
  // bridge alone cannot acknowledge config in a script-disabled frame.
  // Accessible script-disabled APIs are configured by their parent MAIN script.
  const targets = (frames?.length ? frames : [{ frameId: 0, documentId: undefined }]).filter(frame => frame.frameId === 0 ||
    frame.documentId !== undefined && bridgeFrames.get(tab.id!)?.get(frame.frameId) === frame.documentId)
  const applied = await Promise.all(targets.map(async frame => {
    try {
      const response = NetworkAppliedSchema.safeParse(await chrome.tabs.sendMessage(tab.id!, { type: 'update-network-rules', entries }, {
        frameId: frame.frameId, ...(frame.documentId ? { documentId: frame.documentId } : {}),
      }))
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
    let lastError: unknown
    try {
      while (requested) {
        requested = false
        const priorPatterns = [...previousPatterns]
        previousPatterns.clear()
        try {
          const tabs = (await chrome.tabs.query({})).filter(tab => /^https?:\/\//.test(pageUrls.get(tab.id ?? -1) ?? tab.url ?? ''))
          // Finish this pass's tab updates before a retry delivers newer settings.
          const results = await Promise.allSettled(tabs.map(async tab => await updateTab(tab, priorPatterns) ? tab.id! : undefined))
          const failure = results.find(result => result.status === 'rejected')
          if (failure) throw failure.reason
          reloadTabIds = results.flatMap(result => result.status === 'fulfilled' && result.value !== undefined ? [result.value] : [])
          lastError = undefined
        } catch (error) {
          // A queued pass still needs the old website scopes to remove stale mocks.
          for (const pattern of priorPatterns) previousPatterns.add(pattern)
          lastError = error
        }
      }
      if (lastError) throw lastError
      return reloadTabIds
    } finally { syncing = undefined }
  })()
  return syncing
}
const requestSync = () => { void sync().catch(error => console.error('Failed to update Network Rules.', error)) }

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const parsed = NetworkRuntimeMessageSchema.safeParse(message)
  if (!parsed.success) return
  if (parsed.data.type === 'network-page-ready') {
    void activationReady.then(async () => {
      if (sender.tab?.id !== undefined && sender.frameId !== undefined && sender.documentId !== undefined) {
        const frames = bridgeFrames.get(sender.tab.id) ?? new Map<number, string>()
        frames.set(sender.frameId, sender.documentId)
        bridgeFrames.set(sender.tab.id, frames)
        await rememberActiveTab(sender.tab.id, possiblyActiveTabs.has(sender.tab.id))
      }
    }).then(() => respond({ ok: true }), () => respond({ ok: false }))
    return true
  }
  if (parsed.data.type === 'get-network-rules') {
    // Scope comes from the browser's tab metadata, never a page-supplied URL.
    const url = sender.tab?.id === undefined ? '' : pageUrls.get(sender.tab.id) ?? sender.tab.url ?? ''
    void getNetworkRules().then(entries => respond({ entries: networkRulesForPage(entries, url) }), () => respond({ entries: [] }))
    return true
  }
  if (parsed.data.type === 'sync-network-rules') {
    void sync().then(reloadTabIds => respond({ ok: true, reloadTabIds }), error => respond({ ok: false, error: String(error) }))
    return true
  }
})
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !(NETWORK_STORAGE_KEY in changes)) return
  // oldValue also recovers possible stale activation after a worker restart.
  for (const entry of normalizeNetworkRules(changes[NETWORK_STORAGE_KEY].oldValue)) {
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
