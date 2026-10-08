import { syncDynamicRules } from '../lib/dnr'
import { getEntries, STORAGE_KEY } from '../lib/storage'

async function syncFromStorage(): Promise<void> {
  try {
    const rules = await getEntries()
    await syncDynamicRules(rules)
  } catch (error) {
    console.error('Failed to sync dynamic header rules.', error)
  }
}

let syncing = false
let syncRequested = false

function queueSync(): void {
  syncRequested = true
  if (syncing) return
  syncing = true
  void (async () => {
    try {
      while (syncRequested) {
        syncRequested = false
        await syncFromStorage()
      }
    } finally {
      syncing = false
    }
  })()
}

chrome.runtime.onInstalled.addListener(() => {
  queueSync()
})

chrome.runtime.onStartup.addListener(() => {
  queueSync()
})

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !(STORAGE_KEY in changes)) {
    return
  }

  queueSync()
})

queueSync()
