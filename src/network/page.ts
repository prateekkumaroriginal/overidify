import { installNetworkInterceptors } from './interceptor'
import { normalizeNetworkOverrides } from '../lib/network-rules'
import { NetworkBridgeMessageSchema } from '../lib/settings-messages'

const page = window as Window & typeof globalThis & { __overidifyNetwork?: boolean }
if (!page.__overidifyNetwork) {
  page.__overidifyNetwork = true
  const interceptor = installNetworkInterceptors(page)
  let entries = normalizeNetworkOverrides([])
  const children = new WeakMap<Window, ReturnType<typeof installNetworkInterceptors>>()
  const watched = new WeakSet<Node>()
  const roots = new Set<WeakRef<Document | ShadowRoot>>()
  const watchedPrototypes = new WeakSet<object>()
  const watchRoot = (root: Document | ShadowRoot) => {
    if (watched.has(root)) return
    watched.add(root)
    roots.add(new WeakRef(root))
    root.addEventListener('load', () => applySandboxFrames(), true)
    new MutationObserver(records => {
      if (records.some(record => record.addedNodes.length)) applySandboxFrames()
    }).observe(root, { childList: true, subtree: true })
  }
  const watchDocument = (target: typeof page) => {
    watchRoot(target.document)
    const prototype = target.Element.prototype
    if (watchedPrototypes.has(prototype)) return
    watchedPrototypes.add(prototype)
    const attachShadow = prototype.attachShadow
    prototype.attachShadow = function(init: ShadowRootInit) {
      const root = attachShadow.call(this, init)
      watchRoot(root)
      return root
    }
    // Parser-created roots bypass attachShadow. Register them when a parent
    // accesses an open root, or a custom element accesses a closed root.
    for (const owner of [prototype, target.ElementInternals.prototype]) {
      const descriptor = Object.getOwnPropertyDescriptor(owner, 'shadowRoot')
      if (!descriptor?.get) continue
      Object.defineProperty(owner, 'shadowRoot', { ...descriptor, get: function() {
        const root = descriptor.get!.call(this) as ShadowRoot | null
        if (root) { watchRoot(root); applySandboxFrames() }
        return root
      } })
    }
  }
  // Chrome omits MAIN scripts from sandboxed frames without allow-scripts.
  // A same-origin parent can still use that frame's fetch/XHR APIs, so install
  // those accessible APIs from the parent and deliver its scoped settings.
  const applySandboxFrames = () => {
    for (const reference of roots) {
      const root = reference.deref()
      if (!root) { roots.delete(reference); continue }
      for (const frame of root.querySelectorAll<HTMLIFrameElement | HTMLFrameElement>('iframe, frame')) {
        try {
          const sandbox = frame.getAttribute('sandbox')
          const child = frame.contentWindow as typeof page | null
          if (!child || sandbox === null || sandbox.split(/\s+/).includes('allow-scripts')) continue
          let controller = children.get(child)
          if (!child.__overidifyNetwork) {
            controller = installNetworkInterceptors(child, page)
            child.__overidifyNetwork = true
            children.set(child, controller)
          }
          controller?.setOverrides(entries)
          watchDocument(child)
        } catch { /* Opaque/cross-origin frames cannot be called by this parent. */ }
      }
    }
  }
  watchDocument(page)
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
