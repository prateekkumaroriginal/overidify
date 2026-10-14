import type { NetworkOverride } from '../lib/network-overrides'

const bridgeWindow = window as Window & { __overidifyNetworkBridge?: boolean }
if (!bridgeWindow.__overidifyNetworkBridge) {
  bridgeWindow.__overidifyNetworkBridge = true
  let pageReady = false
  let entries: NetworkOverride[] = []
  let sequence = 0
  const pending = new Map<number, (result: { ok: boolean; needsReload?: boolean }) => void>()

  function apply(next: NetworkOverride[]): Promise<{ ok: boolean; needsReload?: boolean }> {
    entries = next
    const id = ++sequence
    return new Promise(resolve => {
      const timeout = window.setTimeout(() => { pending.delete(id); resolve({ ok: false, needsReload: true }) }, 2000)
      pending.set(id, result => { window.clearTimeout(timeout); resolve(result) })
      window.postMessage({ source: 'overidify-network-bridge', type: 'config', id, entries }, '*')
    })
  }

  async function refresh() {
    const version = ++sequence
    try {
      const result = await chrome.runtime.sendMessage({ type: 'get-network-overrides' }) as { entries?: NetworkOverride[] }
      if (version !== sequence) return
      await apply(result.entries ?? [])
    } catch { pageReady = false }
  }

  window.addEventListener('message', event => {
    if (event.source !== window || event.data?.source !== 'overidify-network-page') return
    if (event.data.type === 'ready') { pageReady = true; void refresh() }
    else if (event.data.type === 'applied') {
      pageReady = true
      pending.get(event.data.id)?.({ ok: true, needsReload: Boolean(event.data.needsReload) })
      pending.delete(event.data.id)
    }
  })
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'update-network-overrides') return
    if (!pageReady) window.postMessage({ source: 'overidify-network-bridge', type: 'hello' }, '*')
    void apply(message.entries ?? []).then(sendResponse)
    return true
  })
  window.postMessage({ source: 'overidify-network-bridge', type: 'hello' }, '*')
  void refresh()
}
