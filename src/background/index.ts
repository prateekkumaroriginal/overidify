import { syncSessionRules } from '../lib/dnr'
import { getEntries, STORAGE_KEY } from '../lib/storage'

const pageUrls = new Map<number, string>()

async function syncFromStorage(): Promise<void> {
  const [rules, tabs] = await Promise.all([getEntries(), chrome.tabs.query({})])
  await syncSessionRules(rules, tabs.map((tab) => ({
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
  if (areaName !== 'local' || !(STORAGE_KEY in changes)) {
    return
  }

  requestSync()
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'sync-header-rules') return
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
