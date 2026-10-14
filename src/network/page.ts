import { installNetworkInterceptors } from './interceptor'
import { normalizeNetworkOverrides } from '../lib/network-overrides'
import { NetworkBridgeMessageSchema } from '../lib/settings-messages'

const page = window as Window & typeof globalThis & { __overidifyNetwork?: boolean }
if (!page.__overidifyNetwork) {
  page.__overidifyNetwork = true
  const interceptor = installNetworkInterceptors(page)
  window.addEventListener('message', event => {
    if (event.source !== window) return
    const parsed = NetworkBridgeMessageSchema.safeParse(event.data)
    if (!parsed.success) return
    const message = parsed.data
    if (message.type === 'hello') {
      window.postMessage({ source: 'overidify-network-page', type: 'ready' }, '*')
    } else if (message.type === 'config') {
      interceptor.setOverrides(normalizeNetworkOverrides(message.entries))
      window.postMessage({ source: 'overidify-network-page', type: 'applied', id: message.id, needsReload: interceptor.needsReload }, '*')
    }
  })
  window.postMessage({ source: 'overidify-network-page', type: 'ready' }, '*')
}
