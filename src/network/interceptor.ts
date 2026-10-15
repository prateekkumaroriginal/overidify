import { selectNetworkRule } from '../lib/network-rules'
import type { NetworkRule } from '../lib/network-rules'

type PageWindow = Window & typeof globalThis
const nullBody = (method: string, status: number) => method === 'HEAD' || [204, 205, 304].includes(status)

export function installNetworkInterceptors(page: PageWindow, timers: Pick<PageWindow, 'setTimeout' | 'clearTimeout'> = page) {
  let networkRules: NetworkRule[] = []
  let initialized = false
  let missedSyncRequest = false
  let release: () => void = () => undefined
  const ready = new Promise<void>(resolve => { release = resolve })
  // Fail open if the extension was unloaded or its bridge could not initialize.
  const startup = timers.setTimeout(() => { missedSyncRequest = true; initialized = true; release() }, 3000)
  const originalFetch = page.fetch
  const NativeXHR = page.XMLHttpRequest
  const nativeAddListener = page.EventTarget.prototype.addEventListener
  const nativeDispatch = page.EventTarget.prototype.dispatchEvent

  function withAbort<T>(work: Promise<T>, signal?: AbortSignal | null): Promise<T> {
    if (!signal) return work
    if (signal.aborted) return Promise.reject(signal.reason)
    return new Promise((resolve, reject) => {
      const abort = () => { cleanup(); reject(signal.reason) }
      const cleanup = () => signal.removeEventListener('abort', abort)
      signal.addEventListener('abort', abort, { once: true })
      work.then(value => { cleanup(); resolve(value) }, error => { cleanup(); reject(error) })
    })
  }

  function abortableBody(source: ReadableStream<Uint8Array>, signal: AbortSignal): ReadableStream<Uint8Array> {
    const reader = source.getReader()
    let ended = false
    let detach = () => undefined as void
    return new page.ReadableStream<Uint8Array>({
      start(controller) {
        const abort = () => {
          if (ended) return
          ended = true
          controller.error(signal.reason)
          detach()
          void reader.cancel(signal.reason).catch(() => undefined).finally(() => reader.releaseLock())
        }
        detach = () => signal.removeEventListener('abort', abort)
        signal.addEventListener('abort', abort, { once: true })
        if (signal.aborted) abort()
      },
      async pull(controller) {
        try {
          const chunk = await reader.read()
          if (ended) return
          if (chunk.done) { ended = true; controller.close(); detach(); reader.releaseLock() }
          else controller.enqueue(chunk.value)
        } catch (error) {
          if (!ended) { ended = true; controller.error(error); detach(); reader.releaseLock() }
        }
      },
      cancel(reason) { ended = true; detach(); return reader.cancel(reason).finally(() => reader.releaseLock()) },
    }, { highWaterMark: 0 })
  }

  function mockResponse(entry: NetworkRule, method: string, url: string, signal: AbortSignal): Response {
    const source = new page.ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new page.TextEncoder().encode(entry.body)); controller.close()
    } })
    const body = nullBody(method, entry.status) ? null : abortableBody(source, signal)
    const response = new page.Response(body, {
      status: entry.status, headers: entry.headers.map(({ key, value }) => [key, value]),
    })
    // Response adds text/plain for string bodies. Only configured headers belong
    // in a mock, including when the user deliberately removes Content-Type.
    if (!entry.headers.some(header => header.key.toLowerCase() === 'content-type')) response.headers.delete('content-type')
    // Keep the requested URL useful to API clients, including cloned responses.
    const annotate = (value: Response): Response => {
      const clone = value.clone.bind(value)
      Object.defineProperties(value, {
        url: { configurable: true, value: url },
        clone: { configurable: true, value: () => {
          const branch = clone()
          // A tee branch can buffer the whole body while another branch drains.
          // Keep this branch abortable until its own consumer finishes.
          return annotate(new page.Response(branch.body ? abortableBody(branch.body, signal) : null, {
            status: branch.status, statusText: branch.statusText, headers: branch.headers,
          }))
        } },
      })
      // Chromium's synthetic Response consumers convert stream errors into
      // TypeError. Preserve the request's abort reason for native body methods.
      for (const key of ['text', 'json', 'blob', 'arrayBuffer', 'formData', 'bytes'] as const) {
        const consume = value[key]
        if (consume) Object.defineProperty(value, key, { configurable: true, value: () => signal.aborted
          ? Promise.reject(signal.reason) : withAbort(consume.call(value) as Promise<unknown>, signal) })
      }
      return value
    }
    return annotate(response)
  }

  page.fetch = async function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    // Native normalization accepts cross-frame Requests and handles undefined
    // versus null signals, getters, methods and body ownership consistently.
    const request = new page.Request(input, init)
    const { method, url, signal } = request
    // An initialized request captures its settings before yielding to any work.
    let selected = initialized ? selectNetworkRule(networkRules, url, method, page.document.baseURI) : undefined
    if (!initialized) {
      await withAbort(ready, signal)
      selected = selectNetworkRule(networkRules, url, method, page.document.baseURI)
    }
    if (!selected) return Reflect.apply(originalFetch, page, [request])
    if (signal?.aborted) throw signal.reason
    if (selected.mode === 'call-server') {
      // Use the page's native request so credentials, CORS and DNR header rules
      // still apply. A rejected call is never replaced with a successful mock.
      const realResponse = await Reflect.apply(originalFetch, page, [request]) as Response
      if (signal?.aborted) throw signal.reason
      const response = mockResponse(selected, method, realResponse.url || url, signal)
      // Finish the real download without retaining its body. Cancelling here
      // would abort the server request and truncate its DevTools entry.
      if (realResponse.body) {
        const reader = realResponse.body.getReader()
        void (async () => {
          try { while (!(await reader.read()).done) { /* Discard real bytes. */ } }
          catch { /* The mock was already returned after receiving headers. */ }
          finally { reader.releaseLock() }
        })()
      }
      return response
    }
    // Complete in a task so same-turn cancellation can reject the request,
    // just as it can before a native fetch has received response headers.
    await withAbort(new Promise<void>(resolve => timers.setTimeout(resolve, 0)), signal)
    return mockResponse(selected, method, url, signal)
  }

  function initializeXHR(xhr: XMLHttpRequest): PropertyDescriptorMap {
    const nativeOpen = NativeXHR.prototype.open.bind(xhr)
    const nativeSend = NativeXHR.prototype.send.bind(xhr)
    const nativeAbort = NativeXHR.prototype.abort.bind(xhr)
    const nativeHeader = NativeXHR.prototype.getResponseHeader.bind(xhr)
    const nativeHeaders = NativeXHR.prototype.getAllResponseHeaders.bind(xhr)
    const nativeMime = NativeXHR.prototype.overrideMimeType.bind(xhr)
    const nativeValue = (key: string) => Object.getOwnPropertyDescriptor(NativeXHR.prototype, key)?.get?.call(xhr)
    let method = 'GET'
    let url = ''
    let asynchronous = true
    let entry: NetworkRule | undefined
    let intercepting = false
    let pending = false
    let finished = false
    let sent = false
    let failed = false
    let state = 1
    let generation = 0
    let finalUrl = ''
    let mime = ''
    let result: unknown = null
    let text = ''
    let timer: number | undefined
    let timeout: number | undefined
    let headers = new page.Headers()
    const value = (key: string) => nativeValue(key)
    const event = (type: string, progress = false) => {
      nativeDispatch.call(xhr, progress ? new page.ProgressEvent(type) : new page.Event(type))
    }
    const clearTimers = () => { timers.clearTimeout(timer); timers.clearTimeout(timeout) }

    function finishFailure(type: 'error' | 'abort' | 'timeout') {
      if (finished) return
      const version = generation
      clearTimers()
      finished = true
      pending = false
      failed = true
      state = 4
      headers = new page.Headers()
      result = null
      text = ''
      event('readystatechange')
      if (generation !== version) return
      event(type, true)
      if (generation === version) event('loadend', true)
    }

    function decodeResponse() {
      const responseType = xhr.responseType
      const contentType = mime || headers.get('content-type') || ''
      if (responseType === 'json') {
        try { result = JSON.parse(text) } catch { result = null }
      } else if (responseType === 'blob') result = new page.Blob([text], { type: contentType })
      else if (responseType === 'arraybuffer') result = new page.TextEncoder().encode(text).buffer
      else if (responseType === 'document' || /\bxml\b/i.test(contentType)) {
        const html = /text\/html/i.test(contentType)
        if (html && responseType !== 'document') result = null
        else {
          const parsed = new page.DOMParser().parseFromString(text, html ? 'text/html' : 'application/xml')
          result = parsed.querySelector('parsererror') ? null : parsed
        }
      } else result = text
    }

    function finishResponse() {
      if (!entry || finished) return
      clearTimers()
      const version = generation
      pending = false
      finalUrl = value('responseURL') || url
      headers = new page.Headers(entry.headers.map(({ key, value }) => [key, value]))
      text = nullBody(method, entry.status) ? '' : entry.body
      for (const phase of asynchronous ? nullBody(method, entry.status) ? [2, 4] : [2, 3, 4] : [4]) {
        // HEADERS_RECEIVED callbacks may still choose a response type or MIME.
        if (phase === 3 || (phase === 4 && (!asynchronous || nullBody(method, entry.status)))) decodeResponse()
        state = phase
        if (phase === 4) finished = true
        event('readystatechange')
        if (generation !== version) return
        if (phase === 3) { event('progress', true); if (generation !== version) return }
      }
      event('load', true)
      if (generation === version) event('loadend', true)
    }

    const properties: PropertyDescriptorMap = {
      responseType: {
        get: () => value('responseType'),
        set: next => {
          if (intercepting && state >= 3) throw new page.DOMException('The response type cannot change after loading begins.', 'InvalidStateError')
          Object.getOwnPropertyDescriptor(NativeXHR.prototype, 'responseType')?.set?.call(xhr, next)
        },
      },
      readyState: { get: () => intercepting ? state : value('readyState') },
      status: { get: () => intercepting ? state >= 2 && !failed ? entry?.status ?? 0 : 0 : value('status') },
      statusText: { get: () => intercepting ? '' : value('statusText') },
      responseURL: { get: () => intercepting ? state >= 2 && !failed ? finalUrl || url : '' : value('responseURL') },
      response: { get: () => {
        if (!intercepting) return value('response')
        if (xhr.responseType === '' || xhr.responseType === 'text') return state >= 3 && !failed ? text : ''
        return state === 4 && !failed ? result : null
      } },
      responseText: { get: () => {
        if (!intercepting) return value('responseText')
        if (xhr.responseType !== '' && xhr.responseType !== 'text') throw new page.DOMException('responseText is only available for text responses.', 'InvalidStateError')
        return state >= 3 && !failed ? text : ''
      } },
      responseXML: { get: () => {
        if (!intercepting) return value('responseXML')
        if (xhr.responseType !== '' && xhr.responseType !== 'document') throw new page.DOMException('responseXML is only available for document responses.', 'InvalidStateError')
        return state === 4 && !failed && result instanceof page.Document ? result : null
      } },
    }

    for (const type of ['readystatechange', 'loadstart', 'progress', 'load', 'loadend', 'error', 'timeout', 'abort']) {
      nativeAddListener.call(xhr, type, current => {
        // Synthetic and page-dispatched events are already page-visible.
        // Using event identity avoids confusing a nested native abort with the
        // surrounding synthetic HEADERS_RECEIVED callback.
        if (!intercepting || !current.isTrusted) return
        current.stopImmediatePropagation()
        if (type === 'readystatechange' && value('readyState') >= 2 && value('status') !== 0) finishResponse()
        else if (type === 'error' || type === 'timeout' || type === 'abort') finishFailure(type)
      }, true)
    }

    properties.open = { value: function(...args: [method?: string, url?: string | URL, async?: boolean, username?: string | null, password?: string | null]) {
      if (args.length < 2) return Reflect.apply(NativeXHR.prototype.open, xhr, args)
      const [nextMethod, nextUrl, async, username, password] = args
      // WebIDL converts strings once, before open validates or changes state.
      const nextMethodText = `${nextMethod}`
      const nextUrlText = `${nextUrl}`
      const nextUsername = username == null ? null : `${username}`
      const nextPassword = password == null ? null : `${password}`
      const nextAsync = args.length < 3 || Boolean(async)
      let nextHref: string
      try { nextHref = new page.URL(nextUrlText, page.document.baseURI).href }
      catch { return nativeOpen(nextMethodText, nextUrlText, nextAsync, nextUsername, nextPassword) }
      const previous = { generation, entry, intercepting, pending, finished, sent, failed, result, text,
        state, method, url, asynchronous, timer, timeout }
      generation++
      timer = undefined
      timeout = undefined
      entry = undefined
      intercepting = false
      pending = false
      finished = false
      sent = false
      failed = false
      result = null
      text = ''
      state = 1
      method = nextMethodText.toUpperCase()
      url = nextHref
      asynchronous = nextAsync
      try { nativeOpen(nextMethodText, nextUrlText, nextAsync, nextUsername, nextPassword) }
      catch (error) {
        ({ generation, entry, intercepting, pending, finished, sent, failed, result, text,
          state, method, url, asynchronous, timer, timeout } = previous)
        throw error
      }
      // OPENED callbacks may already have started another request. Clear only
      // the old request's timers, after native validation has succeeded.
      timers.clearTimeout(previous.timer)
      timers.clearTimeout(previous.timeout)
    } }

    function send(body: Document | XMLHttpRequestBodyInit | null | undefined, selected?: NetworkRule) {
      entry = selected
      intercepting = Boolean(entry)
      pending = false
      // The startup timer owns only the wait for configuration. Native XHR
      // takes over timeout handling when a request is handed off.
      timers.clearTimeout(timeout)
      timeout = undefined
      if (!entry) { nativeSend(body); return }
      const version = generation
      state = 1
      if (asynchronous) event('loadstart', true)
      if (generation !== version || finished) return
      if (entry.mode === 'call-server') {
        try { nativeSend(body) } catch (error) {
          if (generation === version) {
            clearTimers()
            intercepting = false
            pending = false
            sent = false
          }
          throw error
        }
        if (!asynchronous && !finished) {
          if (value('status') === 0) finishFailure('error')
          else finishResponse()
        }
      } else if (asynchronous) timer = timers.setTimeout(finishResponse, 0)
      else finishResponse()
    }

    properties.send = { value: function(body?: Document | XMLHttpRequestBodyInit | null) {
      if (pending || (intercepting && sent)) throw new page.DOMException('The request has already been sent.', 'InvalidStateError')
      if (value('readyState') !== 1) { nativeSend(body); return }
      sent = true
      if (!initialized && asynchronous) {
        const version = generation
        pending = true
        intercepting = true
        if (xhr.timeout > 0) timeout = timers.setTimeout(() => finishFailure('timeout'), xhr.timeout)
        void ready.then(() => {
          if (version !== generation || finished) return
          try { send(body, selectNetworkRule(networkRules, url, method)) }
          catch { intercepting = true; finishFailure('error') }
        })
      } else {
        if (!initialized) missedSyncRequest = true
        send(body, initialized ? selectNetworkRule(networkRules, url, method) : undefined)
      }
    } }

    properties.abort = { value: function() {
      if (!intercepting) { nativeAbort(); return }
      const version = generation
      nativeAbort()
      if (generation !== version) return
      if (!finished) finishFailure('abort')
      if (generation !== version) return
      generation++
      pending = false
      state = 0
    } }
    properties.getResponseHeader = { value: (name: string) => {
      const converted = `${name}`
      const native = nativeHeader(converted)
      if (!intercepting) return native
      try { return state >= 2 && !failed ? headers.get(converted) : null }
      catch { return null }
    } }
    properties.getAllResponseHeaders = { value: () => intercepting
      ? state >= 2 && !failed ? [...headers].map(([key, value]) => `${key}: ${value}\r\n`).join('') : ''
      : nativeHeaders() }
    properties.overrideMimeType = { value: (next: string) => {
      if (intercepting && state >= 3) throw new page.DOMException('The MIME type cannot change after loading begins.', 'InvalidStateError')
      nativeMime(next); mime = next
    } }
    properties.setRequestHeader = { value: (name: string, value: string) => {
      if (intercepting && sent) throw new page.DOMException('Headers cannot change after the request is sent.', 'InvalidStateError')
      NativeXHR.prototype.setRequestHeader.call(xhr, name, value)
    } }
    return properties
  }

  // Prototype dispatch lets subclasses networkRule methods and use super without
  // losing interception. Each native instance owns an independent context.
  const contexts = new WeakMap<XMLHttpRequest, PropertyDescriptorMap>()
  class InterceptedXHR extends NativeXHR {
    constructor() { super(); contexts.set(this, initializeXHR(this)) }
  }
  const keys = ['responseType', 'readyState', 'status', 'statusText', 'responseURL', 'response', 'responseText', 'responseXML',
    'open', 'send', 'abort', 'getResponseHeader', 'getAllResponseHeaders', 'overrideMimeType', 'setRequestHeader']
  for (const key of keys) {
    const native = Object.getOwnPropertyDescriptor(NativeXHR.prototype, key)!
    Object.defineProperty(InterceptedXHR.prototype, key, {
      ...native,
      ...(native.value ? { value: function(this: XMLHttpRequest, ...args: unknown[]) {
        return Reflect.apply(contexts.get(this)?.[key].value ?? native.value, this, args)
      } } : {
        get: function(this: XMLHttpRequest) { return (contexts.get(this)?.[key].get ?? native.get)?.call(this) },
        ...(native.set ? { set: function(this: XMLHttpRequest, next: unknown) { (contexts.get(this)?.[key].set ?? native.set)?.call(this, next) } } : {}),
      }),
    })
  }
  Object.defineProperty(InterceptedXHR, 'name', { value: 'XMLHttpRequest' })
  page.XMLHttpRequest = InterceptedXHR

  return {
    setNetworkRules(next: NetworkRule[]) {
      networkRules = next.map(entry => ({ ...entry, headers: entry.headers.map(header => ({ ...header })) }))
      initialized = true
      timers.clearTimeout(startup)
      release()
    },
    get needsReload() { return missedSyncRequest },
  }
}
