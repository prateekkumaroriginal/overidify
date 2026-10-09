import { syncDynamicRules } from '../lib/dnr'
import { getEntries, STORAGE_KEY } from '../lib/storage'

async function syncFromStorage(): Promise<void> {
  const rules = await getEntries()
  await syncDynamicRules(rules)
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
  void queueSync().catch((error) => console.error('Failed to sync dynamic header rules.', error))
}

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
