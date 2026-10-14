import type { NetworkOverride } from '../lib/network-overrides'
import { NetworkPageMessageSchema, NetworkRuntimeMessageSchema, NetworkSettingsResponseSchema } from '../lib/settings-messages'
import type { NetworkApplied } from '../lib/settings-messages'

const bridgeWindow = window as Window & { __overidifyNetworkBridge?: boolean }
if (!bridgeWindow.__overidifyNetworkBridge) {
  bridgeWindow.__overidifyNetworkBridge = true
  let pageReady = false
  let entries: NetworkOverride[] = []
  let sequence = 0
  const pending = new Map<number, (result: NetworkApplied) => void>()

  function apply(next: NetworkOverride[]): Promise<NetworkApplied> {
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
      const result = NetworkSettingsResponseSchema.parse(await chrome.runtime.sendMessage({ type: 'get-network-overrides' }))
      if (version !== sequence) return
      await apply(result.entries ?? [])
    } catch { pageReady = false }
  }

  window.addEventListener('message', event => {
    if (event.source !== window) return
    const parsed = NetworkPageMessageSchema.safeParse(event.data)
    if (!parsed.success) return
    const message = parsed.data
    if (message.type === 'ready') {
      pageReady = true
      void chrome.runtime.sendMessage({ type: 'network-page-ready' }).then(refresh).catch(() => { pageReady = false })
    }
    else if (message.type === 'applied') {
      pageReady = true
      pending.get(message.id)?.({ ok: true, needsReload: message.needsReload })
      pending.delete(message.id)
    }
  })
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const parsed = NetworkRuntimeMessageSchema.safeParse(message)
    if (!parsed.success || parsed.data.type !== 'update-network-overrides') return
    if (!pageReady) window.postMessage({ source: 'overidify-network-bridge', type: 'hello' }, '*')
    void apply(parsed.data.entries).then(sendResponse)
    return true
  })
  window.postMessage({ source: 'overidify-network-bridge', type: 'hello' }, '*')
  void refresh()
}
