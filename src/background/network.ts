import { NETWORK_STORAGE_KEY } from '../lib/network-storage'
import { networkRulesForPage, normalizeNetworkRules, requestUrlKey } from '../lib/network-rules'
import { getDomainPatterns, matchesPageDomain } from '../lib/pattern'
import { NetworkActiveTabsSchema, NetworkBridgeFramesSchema, NetworkAppliedSchema, NetworkRuntimeMessageSchema } from '../lib/settings-messages'
import { resolveRules } from '../lib/resolve-rules'
import type { ActiveNetworkRule } from '../lib/resolve-rules'
import { hasReferences } from '../lib/templates'
import { normalizeVariables, variableValues, VARIABLES_STORAGE_KEY } from '../lib/variables'
import { observationRedaction } from './redaction'
import { recordingTokenForTab } from './executions'

const pageUrls = new Map<number, string>()
const possiblyActiveTabs = new Set<number>()
const previousPatterns = new Set<string>()
// Resolved domains can contain variable values, so the previous activation's
// patterns stay in worker memory only.
let activePatterns = new Set<string>()
const ACTIVE_TABS_KEY = 'networkRuleActiveTabs'
const BRIDGE_FRAMES_KEY = 'networkRuleBridgeFrames'
// A tab can contain several documents that reuse a frame ID over time.
type BridgeDocument = { frameId: number; protectsUrl?: boolean }
const bridgeFrames = new Map<number, Map<string, BridgeDocument>>()
const activationReady = chrome.storage.session.get([ACTIVE_TABS_KEY, BRIDGE_FRAMES_KEY]).then(stored => {
  const parsed = NetworkActiveTabsSchema.safeParse(stored[ACTIVE_TABS_KEY])
  if (parsed.success) for (const id of parsed.data) possiblyActiveTabs.add(id)
  const storedFrames = NetworkBridgeFramesSchema.safeParse(stored[BRIDGE_FRAMES_KEY])
  const possiblySensitiveDocuments: [number, string][] = []
  if (storedFrames.success) for (const { tabId, frames } of storedFrames.data) {
    bridgeFrames.set(tabId, new Map(frames.map(({ documentId, ...document }) => [documentId, document])))
    for (const frame of frames) if (frame.protectsUrl) possiblySensitiveDocuments.push([tabId, frame.documentId])
  }
  // Pages may still hold settings from before a worker restart.
  observationRedaction.initializeNetwork(possiblySensitiveDocuments)
})

async function activeNetworkRules(): Promise<ActiveNetworkRule[]> {
  const stored = await chrome.storage.local.get([NETWORK_STORAGE_KEY, VARIABLES_STORAGE_KEY])
  const rules = normalizeNetworkRules(stored[NETWORK_STORAGE_KEY])
  const variables = normalizeVariables(stored[VARIABLES_STORAGE_KEY])
  return resolveRules({ requestHeaderRules: [], networkRules: rules }, variableValues(variables)).networkRules
}

/** Request URLs whose observations must be hidden: call-server rules with a request URL from a variable. */
function templatedUrls(entries: ActiveNetworkRule[]) {
  return new Set(entries.flatMap(entry => entry.mode === 'call-server' && entry.templated.requestUrl ? [requestUrlKey(entry.requestUrl) ?? ''] : []))
}
let activationWrite: Promise<void> = Promise.resolve()

async function persistActivation(update: () => void, afterWrite?: () => void) {
  await activationReady
  // Serialize writes from concurrent tab updates. Session storage survives
  // worker suspension, and contains no user settings or response bodies.
  activationWrite = activationWrite.catch(() => undefined).then(async () => {
    update()
    await chrome.storage.session.set({
      [ACTIVE_TABS_KEY]: [...possiblyActiveTabs],
      [BRIDGE_FRAMES_KEY]: [...bridgeFrames].map(([tabId, frames]) => ({ tabId, frames: [...frames].map(([documentId, document]) => ({ ...document, documentId })) })),
    })
    afterWrite?.()
  })
  await activationWrite
}

function rememberActiveTab(tabId: number, active: boolean) {
  return persistActivation(() => {
    if (active) possiblyActiveTabs.add(tabId)
    else possiblyActiveTabs.delete(tabId)
  })
}

function rememberDocument(tabId: number | undefined, frameId: number | undefined, documentId: string | undefined, protectsUrl = false) {
  if (tabId === undefined || frameId === undefined || documentId === undefined) return
  const frames = bridgeFrames.get(tabId) ?? new Map<string, BridgeDocument>()
  frames.set(documentId, { frameId, protectsUrl: protectsUrl || frames.get(documentId)?.protectsUrl })
  bridgeFrames.set(tabId, frames)
}

function forgetTab(tabId: number) {
  pageUrls.delete(tabId)
  bridgeFrames.delete(tabId)
  observationRedaction.forgetTab(tabId)
  void rememberActiveTab(tabId, false).catch(error => console.error('Failed to clear network activation state.', error))
}

async function updateTab(tab: chrome.tabs.Tab, priorPatterns: string[], active: ActiveNetworkRule[]) {
  if (tab.id === undefined) return false
  const tabId = tab.id
  await activationReady
  const url = pageUrls.get(tabId) ?? tab.url ?? ''
  // A page receives only its own resolved active rules, never the variable set.
  const entries = networkRulesForPage(active, url)
  const enabled = entries.length > 0
  if (enabled || priorPatterns.some(pattern => matchesPageDomain(pattern, url))) await rememberActiveTab(tabId, true)
  const urls = templatedUrls(entries)
  const registered = [...bridgeFrames.get(tabId)?.keys() ?? []]
  const frames = await chrome.webNavigation.getAllFrames({ tabId }).catch(() => null)
  // Register frames only after their MAIN script's ready handshake. An isolated
  // bridge alone cannot acknowledge config in a script-disabled frame.
  // Accessible script-disabled APIs are configured by their parent MAIN script.
  const targets = (frames?.length ? frames.filter(frame => frame.documentLifecycle === 'active') : [{ frameId: 0, documentId: undefined }])
    .filter(frame => frame.frameId === 0 || frame.documentId !== undefined && bridgeFrames.get(tabId)?.has(frame.documentId))
  const acknowledgments = new Map<string, () => boolean>()
  const prepare = () => {
    for (const { frameId, documentId } of targets) if (documentId !== undefined) {
      if (urls.size) rememberDocument(tabId, frameId, documentId, true)
      acknowledgments.set(documentId, observationRedaction.networkSettingsSent(tabId, documentId, urls))
    }
  }
  if (urls.size) {
    // Sensitive settings may outlast a navigation. Record every recipient by
    // document ID before any page can apply them.
    if (!targets.length || targets.some(frame => frame.documentId === undefined)) return true
    await persistActivation(prepare)
  } else prepare()
  const applied = await Promise.all(targets.map(async frame => {
    try {
      const response = NetworkAppliedSchema.safeParse(await chrome.tabs.sendMessage(tabId, { type: 'update-network-rules', entries, recordingToken: recordingTokenForTab(tabId) }, {
        frameId: frame.frameId, ...(frame.documentId ? { documentId: frame.documentId } : {}),
      }))
      return response.success && response.data.ok && !response.data.needsReload
    } catch { return false }
  }))
  const failed = applied.some(ok => !ok)
  const known = bridgeFrames.get(tabId)
  const failedProtected = targets.some((frame, index) => !applied[index] && frame.documentId && known?.get(frame.documentId)?.protectsUrl)
  const needsReload = failed && (possiblyActiveTabs.has(tabId) || failedProtected)
  const acknowledged = new Set(targets.filter((_, index) => applied[index]).map(frame => frame.documentId))
  const visible = new Set(frames?.map(frame => frame.documentId))
  await persistActivation(() => {
    const known = bridgeFrames.get(tabId)
    // A cached document may acknowledge its new settings on a later visit.
    // Retire each one's old protection independently when it acknowledges.
    for (const id of acknowledged) if (id !== undefined && acknowledgments.get(id)?.()) {
      const doc = known?.get(id)
      if (doc) doc.protectsUrl = urls.size > 0
    }
    if (frames) for (const id of registered) if (!visible.has(id) && !known?.get(id)?.protectsUrl) known?.delete(id)
    if (!enabled && !failed && frames !== null) possiblyActiveTabs.delete(tabId)
  })
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
        const priorPatterns = [...previousPatterns, ...activePatterns]
        previousPatterns.clear()
        const active = await activeNetworkRules()
        activePatterns = new Set(active.flatMap(entry => getDomainPatterns(entry.url)))
        const tabs = (await chrome.tabs.query({})).filter(tab => /^https?:\/\//.test(pageUrls.get(tab.id ?? -1) ?? tab.url ?? ''))
        const results = await Promise.all(tabs.map(async tab => await updateTab(tab, priorPatterns, active) ? tab.id! : undefined))
        reloadTabIds = results.filter((id): id is number => id !== undefined)
      }
      return reloadTabIds
    } finally { syncing = undefined }
  })()
  return syncing
}
// Browser errors can quote settings, including variable values; report application-owned text only.
const ACTIVATION_ERROR = 'Network Rules could not be applied. Reload the extension and website.'
const requestSync = () => { void sync().catch(() => console.error('Failed to update Network Rules.', ACTIVATION_ERROR)) }

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const parsed = NetworkRuntimeMessageSchema.safeParse(message)
  if (!parsed.success) return
  if (parsed.data.type === 'network-page-ready') {
    void persistActivation(() => rememberDocument(sender.tab?.id, sender.frameId, sender.documentId)).then(() => respond({ ok: true }), () => respond({ ok: false }))
    return true
  }
  if (parsed.data.type === 'get-network-rules') {
    // Scope comes from the browser's tab metadata, never a page-supplied URL.
    const url = sender.tab?.id === undefined ? '' : pageUrls.get(sender.tab.id) ?? sender.tab.url ?? ''
    void activeNetworkRules().then(async active => {
      const entries = sender.documentLifecycle && sender.documentLifecycle !== 'active' ? [] : networkRulesForPage(active, url)
      const tabId = sender.tab?.id
      const urls = templatedUrls(entries)
      if (urls.size && (sender.documentId === undefined || sender.frameId === undefined)) {
        respond({ entries: [], recordingToken: recordingTokenForTab(tabId) })
        return
      }
      const reply = () => respond({ entries, recordingToken: recordingTokenForTab(tabId) })
      if (tabId !== undefined && entries.length) {
        // A pull is not an acknowledgment that the other documents updated.
        await persistActivation(() => {
          rememberDocument(tabId, sender.frameId, sender.documentId, urls.size > 0)
          possiblyActiveTabs.add(tabId)
          if (sender.documentId !== undefined) observationRedaction.networkSettingsSent(tabId, sender.documentId, urls)
        }, reply)
      } else reply()
    }).catch(() => respond({ entries: [], recordingToken: recordingTokenForTab(sender.tab?.id) }))
    return true
  }
  if (parsed.data.type === 'sync-network-rules') {
    void sync().then(reloadTabIds => respond({ ok: true, reloadTabIds }), () => respond({ ok: false, error: ACTIVATION_ERROR }))
    return true
  }
})
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !(NETWORK_STORAGE_KEY in changes || VARIABLES_STORAGE_KEY in changes)) return
  // oldValue also recovers possible stale activation after a worker restart.
  // Only literal domains are usable; a domain with a reference needs values from
  // the previous activation, which the persisted possibly-active tabs cover.
  for (const entry of normalizeNetworkRules(changes[NETWORK_STORAGE_KEY]?.oldValue)) {
    if (entry.enabled) for (const domain of getDomainPatterns(entry.url)) if (!hasReferences(domain)) previousPatterns.add(domain as string)
  }
  requestSync()
})
chrome.webNavigation.onBeforeNavigate.addListener(({ tabId, frameId, url }) => { if (frameId === 0) pageUrls.set(tabId, url) })
chrome.webNavigation.onCommitted.addListener(({ tabId, frameId, url }) => {
  if (frameId === 0) {
    pageUrls.set(tabId, url)
    void rememberActiveTab(tabId, false).then(requestSync).catch(() => console.error('Failed to reset network activation state.'))
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
