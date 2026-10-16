import { iconAssets } from '../lib/icon-assets'
import type { IconTheme } from '../lib/icon-assets'

const observerPath = 'offscreen.html'
const observerUrl = chrome.runtime.getURL(observerPath)
let creating: Promise<void> | undefined
let refreshing: Promise<void> | undefined
let updates: Promise<void> = Promise.resolve()
let revision = 0

function isTheme(value: unknown): value is IconTheme {
  return value === 'light' || value === 'dark'
}

// Serialize setIcon calls so an older image load cannot replace a newer theme.
function applyTheme(theme: IconTheme): Promise<void> {
  updates = updates.catch(() => {}).then(() => chrome.action.setIcon({ path: iconAssets[theme] }))
  return updates
}

function ensureObserver(): Promise<void> {
  if (creating) return creating
  creating = (async () => {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [observerUrl],
    })
    if (!contexts.length) {
      await chrome.offscreen.createDocument({
        url: observerPath, reasons: ['MATCH_MEDIA'],
        justification: 'Follow light and dark theme changes for the toolbar icon.',
      })
    }
  })().finally(() => { creating = undefined })
  return creating
}

function refreshTheme(): Promise<void> {
  if (refreshing) return refreshing
  refreshing = (async () => {
    await ensureObserver()
    const startedAt = revision
    const response: unknown = await chrome.runtime.sendMessage({ type: 'read-icon-theme' })
    const theme = response && typeof response === 'object' && 'theme' in response ? response.theme : undefined
    // A live change may have arrived while the initial query was in flight.
    if (isTheme(theme) && revision === startedAt) await applyTheme(theme)
  })().catch(error => console.error('Could not synchronize toolbar icon theme.', error))
    .finally(() => { refreshing = undefined })
  return refreshing
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'icon-theme-changed' || !isTheme(message.theme)
    || sender.id !== chrome.runtime.id || sender.url !== observerUrl) return
  revision++
  void applyTheme(message.theme).then(
    () => sendResponse({ ok: true }),
    error => {
      console.error('Could not update toolbar icon theme.', error)
      sendResponse({ ok: false })
    },
  )
  return true
})

chrome.runtime.onInstalled.addListener(() => { void refreshTheme() })
chrome.runtime.onStartup.addListener(() => { void refreshTheme() })
void refreshTheme()
