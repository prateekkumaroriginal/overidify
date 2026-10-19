const preference = window.matchMedia('(prefers-color-scheme: dark)')
const theme = () => preference.matches ? 'dark' : 'light'
// Only a successful worker acknowledgement confirms a theme was applied.
let reported: ReturnType<typeof theme> | undefined
let reporting: Promise<void> | undefined

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'read-icon-theme' || sender.id !== chrome.runtime.id || sender.tab) return
  sendResponse({ theme: theme() })
})

function reportChange(): void {
  const current = theme()
  if (current === reported || reporting) return
  reporting = chrome.runtime.sendMessage({ type: 'icon-theme-changed', theme: current })
    .then(response => {
      if (!response?.ok) throw new Error('Toolbar theme update was not acknowledged.')
      reported = current
    })
    .catch(error => console.error('Could not report icon theme change.', error))
    .finally(() => { reporting = undefined })
}

preference.addEventListener('change', reportChange)
// Chromium defers media-query change events in hidden documents. Sampling the
// value also catches those changes; unchanged themes never wake the worker.
setInterval(reportChange, 1000)
