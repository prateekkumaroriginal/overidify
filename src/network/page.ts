import { installNetworkInterceptors } from './interceptor'
import { normalizeNetworkOverrides } from '../lib/network-overrides'
import { NetworkBridgeMessageSchema } from '../lib/settings-messages'

const page = window as Window & typeof globalThis & { __overidifyNetwork?: boolean }
if (!page.__overidifyNetwork) {
  page.__overidifyNetwork = true
  const interceptor = installNetworkInterceptors(page)
  let entries = normalizeNetworkOverrides([])
  const children = new WeakMap<Window, ReturnType<typeof installNetworkInterceptors>>()
  // Chrome omits MAIN scripts from sandboxed frames without allow-scripts.
  // A same-origin parent can still use that frame's fetch/XHR APIs, so install
  // those accessible APIs from the parent and deliver its scoped settings.
  function applySandboxFrames(parent: Window = page) {
    for (let index = 0; index < parent.frames.length; index++) {
      const child = parent.frames[index] as typeof page
      try {
        const sandbox = child.frameElement?.getAttribute('sandbox')
        if (sandbox !== null && sandbox !== undefined && !sandbox.split(/\s+/).includes('allow-scripts')) {
          let controller = children.get(child)
          if (!child.__overidifyNetwork) {
            controller = installNetworkInterceptors(child, page)
            child.__overidifyNetwork = true
            children.set(child, controller)
          }
          controller?.setOverrides(entries)
        }
        applySandboxFrames(child)
      } catch { /* Opaque/cross-origin frames cannot be called by this parent. */ }
    }
  }
  document.addEventListener('load', () => applySandboxFrames(), true)
  new MutationObserver(records => {
    if (records.some(record => [...record.addedNodes].some(node => node instanceof Element &&
      (node.matches('iframe, frame') || node.querySelector('iframe, frame'))))) applySandboxFrames()
  }).observe(document, { childList: true, subtree: true })
  window.addEventListener('message', event => {
    if (event.source !== window) return
    const parsed = NetworkBridgeMessageSchema.safeParse(event.data)
    if (!parsed.success) return
    const message = parsed.data
    if (message.type === 'hello') {
      window.postMessage({ source: 'overidify-network-page', type: 'ready' }, '*')
    } else if (message.type === 'config') {
      entries = normalizeNetworkOverrides(message.entries)
      interceptor.setOverrides(entries)
      applySandboxFrames()
      window.postMessage({ source: 'overidify-network-page', type: 'applied', id: message.id, needsReload: interceptor.needsReload }, '*')
    }
  })
  window.postMessage({ source: 'overidify-network-page', type: 'ready' }, '*')
}
