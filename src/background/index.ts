import { syncDynamicRules } from '../lib/dnr'
import { getRules, STORAGE_KEY } from '../lib/storage'

async function syncFromStorage(): Promise<void> {
  try {
    const rules = await getRules()
    await syncDynamicRules(rules)
  } catch (error) {
    console.error('Failed to sync dynamic header rules.', error)
  }
}

function queueSync(): void {
  void syncFromStorage()
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
