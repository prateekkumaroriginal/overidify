import { selectNetworkOverride } from '../lib/network-overrides'
import type { NetworkOverride } from '../lib/network-overrides'

type PageWindow = Window & typeof globalThis
const nullBody = (method: string, status: number) => method === 'HEAD' || [204, 205, 304].includes(status)

export function installNetworkInterceptors(page: PageWindow) {
  let overrides: NetworkOverride[] = []
  let initialized = false
  let missedSyncRequest = false
  let release: () => void = () => undefined
  const ready = new Promise<void>(resolve => { release = resolve })
  // Fail open if the extension was unloaded or its bridge could not initialize.
  const startup = page.setTimeout(() => { missedSyncRequest = true; initialized = true; release() }, 3000)
  const originalFetch = page.fetch
  const NativeXHR = page.XMLHttpRequest

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

  function mockResponse(entry: NetworkOverride, method: string, url: string): Response {
    const response = new page.Response(nullBody(method, entry.status) ? null : entry.body, {
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
        clone: { configurable: true, value: () => annotate(clone()) },
      })
      return value
    }
    return annotate(response)
  }

  page.fetch = async function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const request = input instanceof page.Request ? input : undefined
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase()
    const url = request?.url ?? String(input)
    const signal = init && Object.hasOwn(init, 'signal') ? init.signal : request?.signal
    // An initialized request captures its settings before yielding to any work.
    let selected = initialized ? selectNetworkOverride(overrides, url, method, page.document.baseURI) : undefined
    if (!initialized) {
      await withAbort(ready, signal)
      selected = selectNetworkOverride(overrides, url, method, page.document.baseURI)
    }
    if (!selected) return Reflect.apply(originalFetch, page, [input, init])
    if (signal?.aborted) throw signal.reason
    const validRequest = new page.Request(input, init)
    if (selected.mode === 'call-server') {
      // Use the page's native request so credentials, CORS and DNR header rules
      // still apply. A rejected call is never replaced with a successful mock.
      const realResponse = await Reflect.apply(originalFetch, page, [validRequest]) as Response
      if (signal?.aborted) throw signal.reason
      const response = mockResponse(selected, method, realResponse.url || validRequest.url)
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
    return mockResponse(selected, method, validRequest.url)
  }

  function createXHR(): XMLHttpRequest {
    const xhr = new NativeXHR()
    const nativeOpen = xhr.open.bind(xhr)
    const nativeSend = xhr.send.bind(xhr)
    const nativeAbort = xhr.abort.bind(xhr)
    const nativeHeader = xhr.getResponseHeader.bind(xhr)
    const nativeHeaders = xhr.getAllResponseHeaders.bind(xhr)
    const nativeMime = xhr.overrideMimeType.bind(xhr)
    const nativeValue = (key: string) => Object.getOwnPropertyDescriptor(NativeXHR.prototype, key)?.get?.call(xhr)
    let method = 'GET'
    let url = ''
    let asynchronous = true
    let entry: NetworkOverride | undefined
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
      xhr.dispatchEvent(progress ? new page.ProgressEvent(type) : new page.Event(type))
    }
    const clearTimers = () => { page.clearTimeout(timer); page.clearTimeout(timeout) }

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
      for (const phase of asynchronous ? [2, 3, 4] : [4]) {
        // HEADERS_RECEIVED callbacks may still choose a response type or MIME.
        if (phase === 3 || (!asynchronous && phase === 4)) decodeResponse()
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
    Object.defineProperties(xhr, properties)

    for (const type of ['readystatechange', 'loadstart', 'progress', 'load', 'loadend', 'error', 'timeout', 'abort']) {
      xhr.addEventListener(type, current => {
        // Synthetic and page-dispatched events are already page-visible.
        // Using event identity avoids confusing a nested native abort with the
        // surrounding synthetic HEADERS_RECEIVED callback.
        if (!intercepting || !current.isTrusted) return
        current.stopImmediatePropagation()
        if (type === 'readystatechange' && value('readyState') >= 2 && value('status') !== 0) finishResponse()
        else if (type === 'error' || type === 'timeout' || type === 'abort') finishFailure(type)
      }, true)
    }

    xhr.open = function(nextMethod: string, nextUrl: string | URL, async: boolean = true, username?: string | null, password?: string | null) {
      generation++
      clearTimers()
      entry = undefined
      intercepting = false
      pending = false
      finished = false
      sent = false
      failed = false
      result = null
      text = ''
      mime = ''
      state = 1
      method = nextMethod.toUpperCase()
      url = new page.URL(String(nextUrl), page.document.baseURI).href
      asynchronous = async !== false
      nativeOpen(nextMethod, nextUrl, async, username, password)
    }

    function send(body: Document | XMLHttpRequestBodyInit | null | undefined, selected?: NetworkOverride) {
      entry = selected
      intercepting = Boolean(entry)
      pending = false
      // The startup timer owns only the wait for configuration. Native XHR
      // takes over timeout handling when a request is handed off.
      page.clearTimeout(timeout)
      timeout = undefined
      if (!entry) { nativeSend(body); return }
      const version = generation
      state = 1
      if (asynchronous) event('loadstart', true)
      if (generation !== version || finished) return
      if (entry.mode === 'call-server') {
        nativeSend(body)
        if (!asynchronous && !finished) {
          if (value('status') === 0) finishFailure('error')
          else finishResponse()
        }
      } else if (asynchronous) timer = page.setTimeout(finishResponse, 0)
      else finishResponse()
    }

    xhr.send = function(body?: Document | XMLHttpRequestBodyInit | null) {
      if (pending || (intercepting && sent)) throw new page.DOMException('The request has already been sent.', 'InvalidStateError')
      if (value('readyState') !== 1) { nativeSend(body); return }
      sent = true
      if (!initialized && asynchronous) {
        const version = generation
        pending = true
        intercepting = true
        if (xhr.timeout > 0) timeout = page.setTimeout(() => finishFailure('timeout'), xhr.timeout)
        void ready.then(() => {
          if (version !== generation || finished) return
          try { send(body, selectNetworkOverride(overrides, url, method)) }
          catch { intercepting = true; finishFailure('error') }
        })
      } else {
        if (!initialized) missedSyncRequest = true
        send(body, initialized ? selectNetworkOverride(overrides, url, method) : undefined)
      }
    }

    xhr.abort = function() {
      if (!intercepting) { nativeAbort(); return }
      nativeAbort()
      if (!finished) finishFailure('abort')
      generation++
      pending = false
      state = 0
    }
    xhr.getResponseHeader = name => intercepting
      ? state >= 2 && !failed ? headers.get(name) : null
      : nativeHeader(name)
    xhr.getAllResponseHeaders = () => intercepting
      ? state >= 2 && !failed ? [...headers].map(([key, value]) => `${key}: ${value}\r\n`).join('') : ''
      : nativeHeaders()
    xhr.overrideMimeType = next => {
      if (intercepting && state >= 3) throw new page.DOMException('The MIME type cannot change after loading begins.', 'InvalidStateError')
      nativeMime(next); mime = next
    }
    return xhr
  }

  // Return native instances: instanceof, constants, upload and native setters
  // continue to work without a second public XHR object.
  page.XMLHttpRequest = new Proxy(NativeXHR, { construct: () => createXHR() })

  return {
    setOverrides(next: NetworkOverride[]) {
      overrides = next.map(entry => ({ ...entry, headers: entry.headers.map(header => ({ ...header })) }))
      initialized = true
      page.clearTimeout(startup)
      release()
    },
    get needsReload() { return missedSyncRequest },
  }
}
