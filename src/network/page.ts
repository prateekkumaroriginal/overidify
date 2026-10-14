import { installNetworkInterceptors } from './interceptor'
import { normalizeNetworkOverrides } from '../lib/network-overrides'

const page = window as Window & typeof globalThis & { __overidifyNetwork?: boolean }
if (!page.__overidifyNetwork) {
  page.__overidifyNetwork = true
  const interceptor = installNetworkInterceptors(page)
  window.addEventListener('message', event => {
    if (event.source !== window || event.data?.source !== 'overidify-network-bridge') return
    if (event.data.type === 'hello') {
      window.postMessage({ source: 'overidify-network-page', type: 'ready' }, '*')
    } else if (event.data.type === 'config') {
      interceptor.setOverrides(normalizeNetworkOverrides(event.data.entries))
      window.postMessage({ source: 'overidify-network-page', type: 'applied', id: event.data.id, needsReload: interceptor.needsReload }, '*')
    }
  })
  window.postMessage({ source: 'overidify-network-page', type: 'ready' }, '*')
}
