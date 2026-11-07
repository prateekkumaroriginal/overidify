import type { NetworkRule } from '../lib/network-rules'
import { NetworkPageMessageSchema, NetworkRuntimeMessageSchema, NetworkSettingsResponseSchema } from '../lib/settings-messages'
import type { NetworkApplied } from '../lib/settings-messages'

const bridgeWindow = window as Window & { __overidifyNetworkBridge?: boolean }
if (!bridgeWindow.__overidifyNetworkBridge) {
  bridgeWindow.__overidifyNetworkBridge = true
  let pageReady = false
  let entries: NetworkRule[] = []
  let sequence = 0
  let recordingToken: string | null = null
  let recordingRevision = 0
  const pending = new Map<number, (result: NetworkApplied) => void>()

  function apply(next: NetworkRule[], token = recordingToken): Promise<NetworkApplied> {
    entries = next
    recordingToken = token
    // Reporting must be enabled before config releases document-start calls.
    window.postMessage({ source: 'overidify-network-bridge', type: 'recording', token }, '*')
    const id = ++sequence
    return new Promise(resolve => {
      const timeout = window.setTimeout(() => { pending.delete(id); resolve({ ok: false, needsReload: true }) }, 2000)
      pending.set(id, result => { window.clearTimeout(timeout); resolve(result) })
      window.postMessage({ source: 'overidify-network-bridge', type: 'config', id, entries }, '*')
    })
  }

  async function refresh() {
    const version = ++sequence
    const revision = recordingRevision
    try {
      const result = NetworkSettingsResponseSchema.parse(await chrome.runtime.sendMessage({ type: 'get-network-rules' }))
      if (version !== sequence) return
      await apply(result.entries ?? [], revision === recordingRevision ? result.recordingToken ?? null : recordingToken)
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
    else if (message.type === 'execution') {
      void chrome.runtime.sendMessage({ type: 'network-execution', token: message.token, record: message.record }).catch(() => undefined)
    }
    else if (message.type === 'applied') {
      pageReady = true
      pending.get(message.id)?.({ ok: true, needsReload: message.needsReload })
      pending.delete(message.id)
    }
  })
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const parsed = NetworkRuntimeMessageSchema.safeParse(message)
    if (!parsed.success) return
    if (parsed.data.type === 'record-network-executions') {
      recordingRevision++
      recordingToken = parsed.data.token
      window.postMessage({ source: 'overidify-network-bridge', type: 'recording', token: parsed.data.token }, '*')
      sendResponse({ ok: true })
      return
    }
    if (parsed.data.type !== 'update-network-rules') return
    if (!pageReady) window.postMessage({ source: 'overidify-network-bridge', type: 'hello' }, '*')
    void apply(parsed.data.entries, parsed.data.recordingToken).then(sendResponse)
    return true
  })
  window.postMessage({ source: 'overidify-network-bridge', type: 'hello' }, '*')
  void refresh()
}
