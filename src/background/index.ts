import { headerActivationMessage, syncRequestHeaderSessionRules } from '../lib/dnr'
import { REQUEST_HEADER_STORAGE_KEY } from '../lib/request-header-storage'
import { normalizeRequestHeaderRules } from '../lib/request-header-rules'
import { normalizeVariables, variableValues, VARIABLES_STORAGE_KEY } from '../lib/variables'
import { resolveRules } from '../lib/resolve-rules'
import { observationRedaction } from './redaction'
import './network'
import './action-icon'
import './executions'

const pageUrls = new Map<number, string>()

async function syncFromStorage(): Promise<void> {
  const [stored, tabs] = await Promise.all([
    chrome.storage.local.get([REQUEST_HEADER_STORAGE_KEY, VARIABLES_STORAGE_KEY]),
    chrome.tabs.query({}),
  ])
  const rules = normalizeRequestHeaderRules(stored[REQUEST_HEADER_STORAGE_KEY])
  const variables = normalizeVariables(stored[VARIABLES_STORAGE_KEY])
  // Resolution is the only path from saved templates to installed header values.
  const resolved = resolveRules({ requestHeaderRules: rules, networkRules: [] }, variableValues(variables))
  let settle: ((ok: boolean) => void) | undefined
  await syncRequestHeaderSessionRules(resolved.requestHeaderRules, tabs.map((tab) => ({
    id: tab.id,
    url: tab.id === undefined ? tab.url : pageUrls.get(tab.id) ?? tab.url,
  })), {
    beforeInstall: (previous, next) => { settle = observationRedaction.headerTransition(previous, next) },
    afterInstall: ok => settle?.(ok),
  })
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
  // Log only application-owned text; browser errors can quote variable values.
  void queueSync().catch((error) => console.error('Failed to sync page header rules.', headerActivationMessage(error)))
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
      error: headerActivationMessage(error),
    }),
  )
  return true
})

requestSync()
