import { syncRequestHeaderSessionRules } from '../lib/dnr'
import { getRequestHeaderRules, REQUEST_HEADER_STORAGE_KEY } from '../lib/request-header-storage'
import { resolveRules } from '../lib/rule-resolution'
import { getVariables, VARIABLES_STORAGE_KEY } from '../lib/variables-storage'
import { syncNetworkRules } from './network'
import { startMcpBridge } from './mcp'
import './action-icon'
import './executions'

const pageUrls = new Map<number, string>()

async function syncFromStorage(): Promise<void> {
  const [rules, variables, tabs] = await Promise.all([getRequestHeaderRules(), getVariables(), chrome.tabs.query({})])
  const resolved = resolveRules({ requestHeaderRules: rules, networkRules: [] }, variables).requestHeaderRules
  await syncRequestHeaderSessionRules(resolved, tabs.map((tab) => ({
    id: tab.id,
    url: tab.id === undefined ? tab.url : pageUrls.get(tab.id) ?? tab.url,
  })))
}

let syncing: Promise<void> | undefined
let syncRequested = false

function queueSync(): Promise<void> {
  syncRequested = true
  if (syncing) return syncing
  syncing = (async () => {
    let lastError: unknown
    try {
      while (syncRequested) {
        syncRequested = false
        try {
          await syncFromStorage()
          lastError = undefined
        } catch (error) {
          lastError = error
        }
      }
      if (lastError) throw lastError
    } finally {
      syncing = undefined
    }
  })()
  return syncing
}

function requestSync(): void {
  void queueSync().catch((error) => console.error('Failed to sync page header rules.', error))
}

function updatePage(tabId: number, url: string): void {
  pageUrls.set(tabId, url)
  requestSync()
}

// Start before the new document loads, so its first API requests use its rules.
chrome.webNavigation.onBeforeNavigate.addListener(({ tabId, frameId, url }) => {
  if (frameId === 0) updatePage(tabId, url)
})

chrome.webNavigation.onCommitted.addListener(({ tabId, frameId, url }) => {
  if (frameId === 0) updatePage(tabId, url)
})

chrome.webNavigation.onErrorOccurred.addListener(({ tabId, frameId }) => {
  if (frameId !== 0) return
  pageUrls.delete(tabId)
  requestSync()
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url !== undefined) updatePage(tabId, changeInfo.url)
})

chrome.tabs.onCreated.addListener(() => requestSync())
chrome.tabs.onRemoved.addListener((tabId) => {
  pageUrls.delete(tabId)
  requestSync()
})
chrome.tabs.onReplaced.addListener((_addedTabId, removedTabId) => {
  pageUrls.delete(removedTabId)
  requestSync()
})

chrome.runtime.onInstalled.addListener(() => {
  requestSync()
})

chrome.runtime.onStartup.addListener(() => {
  requestSync()
})

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !(REQUEST_HEADER_STORAGE_KEY in changes || VARIABLES_STORAGE_KEY in changes)) {
    return
  }

  requestSync()
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'sync-request-header-rules') return
  void queueSync().then(
    () => sendResponse({ ok: true }),
    (error: unknown) => sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }),
  )
  return true
})

requestSync()

// Rule changes made over MCP happen in this worker, so activate them directly.
startMcpBridge(async () => {
  const [headers, network] = await Promise.allSettled([queueSync(), syncNetworkRules()])
  const errors = [headers, network].flatMap(result => result.status === 'rejected'
    ? [result.reason instanceof Error ? result.reason.message : String(result.reason)] : [])
  return {
    ok: errors.length === 0,
    reloadTabIds: network.status === 'fulfilled' ? network.value : [],
    error: errors.length ? errors.join(' ') : undefined,
  }
})
