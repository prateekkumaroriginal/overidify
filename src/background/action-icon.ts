import { iconAssets } from '../lib/icon-assets'
import type { IconTheme } from '../lib/icon-assets'

const observerPath = 'offscreen.html'
const observerUrl = chrome.runtime.getURL(observerPath)
let creating: Promise<void> | undefined
let refreshing: Promise<void> | undefined
let updates: Promise<void> = Promise.resolve()
let revision = 0
const browserThemeKey = 'browserIconTheme'
let browserTheme: IconTheme | undefined

// Preserve the browser preference when the worker sleeps. The offscreen
// document's OS preference must not overwrite it after the worker restarts.
const restoring = chrome.storage.session.get(browserThemeKey).then(stored => {
  if (!browserTheme && isTheme(stored[browserThemeKey])) browserTheme = stored[browserThemeKey]
}).catch(error => console.error('Could not restore toolbar icon theme.', error))

function isTheme(value: unknown): value is IconTheme {
  return value === 'light' || value === 'dark'
}

// Serialize setIcon calls so an older image load cannot replace a newer theme.
function applyTheme(theme: IconTheme, remember = false): Promise<void> {
  updates = updates.catch(() => {}).then(async () => {
    await chrome.action.setIcon({ path: iconAssets[theme] })
    if (remember) await chrome.storage.session.set({ [browserThemeKey]: theme })
  })
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
    await restoring
    if (browserTheme) {
      await applyTheme(browserTheme)
      return
    }
    await ensureObserver()
    const startedAt = revision
    const response: unknown = await chrome.runtime.sendMessage({ type: 'read-icon-theme' })
    const theme = response && typeof response === 'object' && 'theme' in response ? response.theme : undefined
    // A live change may have arrived while the initial query was in flight.
    const current = browserTheme ?? theme
    if (revision === startedAt && isTheme(current)) await applyTheme(current)
  })().catch(error => console.error('Could not synchronize toolbar icon theme.', error))
    .finally(() => { refreshing = undefined })
  return refreshing
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isTheme(message?.theme) || sender.id !== chrome.runtime.id) return
  const observer = message.type === 'icon-theme-changed' && sender.url === observerUrl
  const pageUrl = sender.url?.split(/[?#]/)[0]
  const extensionPage = pageUrl === chrome.runtime.getURL('options.html') || pageUrl === chrome.runtime.getURL('popup.html')
  const website = sender.tab?.active && !sender.tab.incognito && sender.frameId === 0 && /^https?:\/\//.test(sender.url ?? '')
  const browser = message.type === 'browser-icon-theme-changed' && (extensionPage || website)
  if (!observer && !browser) return
  revision++
  if (browser) browserTheme = message.theme
  void restoring.then(() => applyTheme(browserTheme ?? message.theme, browser)).then(
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
