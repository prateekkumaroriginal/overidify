// Visible documents inherit Chrome's appearance setting. Offscreen documents
// can keep reporting the OS theme even when Chrome uses a different theme.
if (window.top === window && globalThis.chrome?.runtime?.id && !chrome.extension?.inIncognitoContext
  && /^(https?|chrome-extension):$/.test(window.location.protocol)) {
  const preference = window.matchMedia('(prefers-color-scheme: dark)')
  const theme = () => preference.matches ? 'dark' : 'light'
  let reported: ReturnType<typeof theme> | undefined
  let reporting = false
  let retry: number | undefined

  async function reportChange(refresh = false): Promise<void> {
    if (document.visibilityState !== 'visible' || reporting || !chrome.runtime.id) return
    const current = theme()
    if (!refresh && current === reported) return
    window.clearTimeout(retry)
    reporting = true
    let acknowledged = false
    try {
      const response = await chrome.runtime.sendMessage({ type: 'browser-icon-theme-changed', theme: current })
      if (!response?.ok) throw new Error('Toolbar theme update was not acknowledged.')
      reported = current
      acknowledged = true
    } catch {
      if (chrome.runtime.id) retry = window.setTimeout(() => { void reportChange() }, 1000)
    } finally {
      reporting = false
      if (acknowledged && theme() !== reported) void reportChange()
    }
  }

  preference.addEventListener('change', () => { void reportChange() })
  // Another page may have changed the global icon while this page was hidden.
  document.addEventListener('visibilitychange', () => { void reportChange(true) })
  window.addEventListener('focus', () => { void reportChange(true) })
  void reportChange()
}
