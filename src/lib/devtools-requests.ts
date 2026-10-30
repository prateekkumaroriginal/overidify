import { NETWORK_METHODS, createNetworkRuleDraft, requestUrlKey, validateNetworkRule } from './network-rules.ts'
import type { NetworkMethod, NetworkRuleDraft } from './network-rules.ts'
import { updateNetworkRules } from './network-storage.ts'

export type DevtoolsRequest = {
  startedDateTime: string
  pageref?: string
  _resourceType?: string | null
  request: { url: string; method: string }
  response: { status: number; headers: { name: string; value: string }[]; content: { mimeType: string } }
  getContent: (callback: (content: string, encoding: string) => void) => void
}
export type CapturedRequest = { id: string; request: DevtoolsRequest; pageUrl: Promise<string>; unavailableReason?: string }

export class DevtoolsResponseUnavailableError extends Error {
  constructor(message = 'Chrome could not read this captured response. Trigger the request again and use the new capture.') {
    super(message)
    this.name = 'DevtoolsResponseUnavailableError'
  }
}

export function devtoolsRequestLabel(input: string, fullPath: boolean): { name: string; host: string } {
  const url = new URL(input)
  const path = url.pathname
  const lastSlash = path.lastIndexOf('/', path.endsWith('/') ? path.length - 2 : path.length - 1)
  const name = fullPath ? path : path.slice(lastSlash + 1) || '/'
  return { name: name + url.search, host: url.host }
}

function isApiRequest(request: DevtoolsRequest): boolean {
  const resourceType = request._resourceType?.toLowerCase()
  return ['fetch', 'xhr'].includes(resourceType ?? '')
}

// Metadata checks are shared by the list and draft creation. Reading the body
// can still fail later, including when Chrome has no MIME type to classify.
export function devtoolsRequestUnsupportedReason(request: DevtoolsRequest): string | null {
  if (!isApiRequest(request)) return 'Only Fetch and XHR calls can be overridden.'
  if (requestUrlKey(request.request.url) === null) return 'Only HTTP and HTTPS request URLs can be overridden.'
  if (!NETWORK_METHODS.some(method => method !== 'ANY' && method === request.request.method)) {
    return `The ${request.request.method} method is not supported by Network Rules.`
  }
  const mimeType = request.response.content.mimeType
  if (mimeType && !/^(?:text\/|application\/(?:[^;]*\+)?(?:json|xml)\b|application\/(?:javascript|x-javascript|x-www-form-urlencoded|graphql|x-ndjson)\b)/i.test(mimeType)) {
    return `Responses of type ${mimeType} are not supported. Choose a JSON, XML, or text API response.`
  }
  return null
}

// DevTools invalidates response handles on navigation. Read supported bodies
// while the handle is valid, and retain the result only in this panel's memory.
function retainResponse(request: DevtoolsRequest, fallback = request): DevtoolsRequest {
  if (devtoolsRequestUnsupportedReason(request) || !request.response.status) return request
  const content = new Promise<[string, string] | null>(resolve => {
    try {
      request.getContent((body, encoding) => resolve(typeof body === 'string' ? [body, encoding] : null))
    } catch { resolve(null) }
  })
  return { ...request, getContent(callback) {
    void content.then(result => {
      if (result) callback(...result)
      else {
        // An unfinished HAR body may become available before its completion.
        try { fallback.getContent(callback) }
        catch { callback(undefined as unknown as string, '') }
      }
    })
  } }
}

export function observeDevtoolsRequests(
  network: Pick<typeof chrome.devtools.network, 'getHAR' | 'onRequestFinished' | 'onNavigated'>,
  onChange: (requests: CapturedRequest[]) => void,
  initialPageUrl: Promise<string> = Promise.resolve(''),
) {
  const requests = new Map<string, CapturedRequest>()
  const hydratedIds = new Map<string, string[]>()
  const clearedCounts = new Map<string, number>()
  let sequence = 0
  let generation = 0
  let refreshVersion = 0
  let disposed = false
  let pageUrl = initialPageUrl
  const signature = (request: DevtoolsRequest) => JSON.stringify([request.startedDateTime, request.request.method, request.request.url])
  function add(request: DevtoolsRequest, hydrated = false, scope = pageUrl) {
    if (!isApiRequest(request)) return
    const id = String(++sequence)
    requests.set(id, { id, request: retainResponse(request), pageUrl: scope })
    if (hydrated) {
      const key = signature(request)
      const ids = hydratedIds.get(key) ?? []
      ids.push(id)
      hydratedIds.set(key, ids)
    }
  }
  function publish() {
    const latest = [...requests.values()].sort((a, b) =>
      a.request.startedDateTime.localeCompare(b.request.startedDateTime) || Number(a.id) - Number(b.id))
    onChange(latest)
  }
  function finished(request: chrome.devtools.network.Request) {
    if (!isApiRequest(request)) return
    const key = signature(request)
    const ids = hydratedIds.get(key)
    const id = ids?.shift()
    if (ids?.length === 0) hydratedIds.delete(key)
    if (id) {
      // A cleared hydrated occurrence stays hidden when its completion arrives.
      const previous = requests.get(id)
      if (previous) requests.set(id, { id, request: retainResponse(request, previous.request), pageUrl: previous.pageUrl })
    } else add(request)
    publish()
  }
  function markUnavailable(id: string, reason: string) {
    const item = requests.get(id)
    if (disposed || !item) return
    requests.set(id, { ...item, unavailableReason: reason })
    publish()
  }
  function clear() {
    generation++
    for (const { request } of requests.values()) {
      const key = signature(request)
      clearedCounts.set(key, (clearedCounts.get(key) ?? 0) + 1)
    }
    requests.clear()
    publish()
  }
  function navigated(url: string) { pageUrl = Promise.resolve(url); generation++; refresh() }
  network.onRequestFinished.addListener(finished)
  network.onNavigated.addListener(navigated)
  function refresh() {
    const initialGeneration = generation
    const snapshotPageUrl = pageUrl
    const version = ++refreshVersion
    network.getHAR(log => {
      if (disposed || generation !== initialGeneration || version !== refreshVersion) return
      const knownCounts = new Map(clearedCounts)
      for (const { request } of requests.values()) {
        const key = signature(request)
        knownCounts.set(key, (knownCounts.get(key) ?? 0) + 1)
      }
      for (const entry of log.entries) {
        const request = entry as chrome.devtools.network.Request
        if (!isApiRequest(request)) continue
        const key = signature(request)
        const knownCount = knownCounts.get(key) ?? 0
        if (knownCount) knownCounts.set(key, knownCount - 1)
        else {
          // HAR pages identify the document, separately from an API's host.
          // A missing page reference must not silently use another website.
          const harPage = request.pageref ? log.pages?.find(page => page.id === request.pageref) : undefined
          const scope = request.pageref ? Promise.resolve(harPage?.title ?? '') : snapshotPageUrl
          add(request, true, scope)
        }
      }
      publish()
    })
  }
  refresh()
  return {
    clear, refresh, markUnavailable,
    dispose() {
      disposed = true
      network.onRequestFinished.removeListener(finished)
      network.onNavigated.removeListener(navigated)
    },
  }
}

// DevTools returns decoded content; copied transport headers would describe the
// original bytes. Cookies cannot be set by a mock response.
const excludedHeader = /^(?:set-cookie2?|content-length|content-encoding|transfer-encoding|connection|keep-alive|proxy-connection|trailer|upgrade)$/i

export async function draftFromDevtoolsRequest(request: DevtoolsRequest, pageUrl: string): Promise<NetworkRuleDraft> {
  const unsupportedReason = devtoolsRequestUnsupportedReason(request)
  if (unsupportedReason) throw new Error(unsupportedReason)
  let page: URL
  try { page = new URL(pageUrl) }
  catch { throw new Error('The website for this capture is unknown. Capture the request again on its original website.') }
  if (!['http:', 'https:'].includes(page.protocol)) throw new Error('Open DevTools on an HTTP or HTTPS website.')
  const mimeType = request.response.content.mimeType
  const body = await new Promise<string>((resolve, reject) => {
    try {
      request.getContent((content, encoding) => {
        if (typeof content !== 'string') { reject(new DevtoolsResponseUnavailableError()); return }
        try {
          if (!encoding) resolve(content)
          else if (encoding === 'base64') resolve(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(content), byte => byte.charCodeAt(0))))
          else reject(new DevtoolsResponseUnavailableError('This response uses an unsupported encoding.'))
        } catch { reject(new DevtoolsResponseUnavailableError('This response could not be decoded as text.')) }
      })
    } catch { reject(new DevtoolsResponseUnavailableError()) }
  })
  const headers = request.response.headers
    .filter(header => !excludedHeader.test(header.name.trim()) && !header.name.startsWith(':'))
    .map(header => ({ key: header.name.trim(), value: header.value.trim() }))
  if (mimeType && !headers.some(header => header.key.toLowerCase() === 'content-type')) headers.push({ key: 'Content-Type', value: mimeType })
  const url = new URL(request.request.url)
  const draft: NetworkRuleDraft = {
    ...createNetworkRuleDraft(),
    name: `${request.request.method} ${url.pathname}`,
    url: page.host, requestUrl: request.request.url, method: request.request.method as NetworkMethod,
    body, headers,
    status: request.response.status >= 200 && request.response.status <= 599 ? request.response.status : 200,
  }
  const error = validateNetworkRule(draft)
  if (error) throw new Error(error)
  return draft
}

// Reuse the same ID on updates and retries, including a saved rule whose
// activation failed. The shared storage lock protects simultaneous settings edits.
export async function saveDevtoolsOverride(id: string, draft: NetworkRuleDraft) {
  const error = validateNetworkRule(draft)
  if (error) throw new Error(error)
  return updateNetworkRules(rules => {
    const existing = rules.find(rule => rule.id === id)
    const rule = { ...draft, id, order: existing?.order ?? rules.length }
    return existing ? rules.map(current => current.id === id ? rule : current) : [...rules, rule]
  })
}
