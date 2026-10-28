import assert from 'node:assert/strict'
import { test } from 'node:test'
import { draftFromDevtoolsRequest, observeDevtoolsRequests, saveDevtoolsOverride } from '../src/lib/devtools-requests.ts'
import type { CapturedRequest, DevtoolsRequest } from '../src/lib/devtools-requests.ts'
import { matchesNetworkRequest } from '../src/lib/network-rules.ts'
import { matchesPageDomain } from '../src/lib/pattern.ts'

function request(patch: Partial<DevtoolsRequest> = {}): DevtoolsRequest {
  return {
    startedDateTime: '2026-10-28T12:00:00.000Z', _resourceType: 'fetch',
    request: { method: 'POST', url: 'https://api.example.com/chats?tab=featured' },
    response: { status: 201, headers: [{ name: 'Content-Type', value: 'application/json' }], content: { mimeType: 'application/json' } },
    getContent: callback => callback(' {"chats": []}\n', ''), ...patch,
  }
}

test('a capture supplies the response and an exact request match scoped to the inspected website', async () => {
  const capture = request()
  const draft = await draftFromDevtoolsRequest(capture, 'http://localhost:4200/messages')
  assert.equal(draft.name, 'POST /chats')
  assert.equal(draft.url, 'localhost:4200')
  assert.equal(draft.method, 'POST')
  assert.equal(draft.status, 201)
  assert.equal(draft.mode, 'bypass')
  assert.equal(draft.enabled, true)
  assert.equal(draft.body, ' {"chats": []}\n')
  assert.deepEqual(draft.headers, [{ key: 'Content-Type', value: 'application/json' }])
  const rule = { ...draft, id: crypto.randomUUID(), order: 0 }
  assert.equal(matchesNetworkRequest(rule, capture.request.url, 'POST'), true)
  assert.equal(matchesNetworkRequest(rule, capture.request.url, 'GET'), false)
  assert.equal(matchesNetworkRequest(rule, capture.request.url + '&extra=1', 'POST'), false)
  assert.equal(matchesPageDomain(draft.url, 'http://localhost:4200/other'), true)
  assert.equal(matchesPageDomain(draft.url, 'https://api.example.com'), false)
})

test('captured headers omit cookies and original transport metadata while retaining application headers', async () => {
  const capture = request()
  capture.response.headers = [
    ...['Set-Cookie', 'set-cookie2', 'Content-Length', 'Content-Encoding', 'Transfer-Encoding', 'Connection', 'Keep-Alive', 'Trailer', 'Upgrade', ':status'].map(name => ({ name, value: 'original' })),
    { name: 'X-Total', value: ' 42 ' },
  ]
  const draft = await draftFromDevtoolsRequest(capture, 'https://app.example.com')
  assert.deepEqual(draft.headers, [{ key: 'X-Total', value: '42' }, { key: 'Content-Type', value: 'application/json' }])
  assert.equal(capture.response.headers[0].name, 'Set-Cookie', 'capture must remain unchanged')
})

test('response text preserves empty and invalid JSON, and decodes base64 UTF-8 without a replay', async () => {
  for (const body of ['', '{broken', 'héllo 🌍']) {
    const draft = await draftFromDevtoolsRequest(request({ getContent: callback => callback(body, '') }), 'https://app.example.com')
    assert.equal(draft.body, body)
  }
  const body = 'héllo 🌍'
  const draft = await draftFromDevtoolsRequest(request({ getContent: callback => callback(Buffer.from(body).toString('base64'), 'base64') }), 'https://app.example.com')
  assert.equal(draft.body, body)
})

test('unsupported captures, binary or unreadable content, invalid headers and non-website scopes cannot become mocks', async () => {
  const binary = request(); binary.response.content.mimeType = 'image/png'
  const invalidHeader = request(); invalidHeader.response.headers.push({ name: 'X-Broken', value: 'a\r\nb' })
  const cases = [
    request({ _resourceType: 'script' }),
    request({ request: { method: 'TRACE', url: 'https://api.example.com' } }),
    request({ request: { method: 'GET', url: 'file:///local' } }),
    binary, invalidHeader,
    request({ getContent: callback => callback(undefined as unknown as string, '') }),
    request({ getContent: callback => callback('/w==', 'base64') }),
    request({ getContent: callback => callback('body', 'unknown') }),
    request({ getContent: () => { throw new Error('unavailable') } }),
  ]
  for (const capture of cases) await assert.rejects(draftFromDevtoolsRequest(capture, 'https://app.example.com'))
  await assert.rejects(draftFromDevtoolsRequest(request(), 'chrome://extensions'))
  await assert.rejects(draftFromDevtoolsRequest(request(), ''))
})

test('failed requests default to an editable 200 response while bodyless HTTP responses keep their status', async () => {
  for (const status of [0, 101, 204, 304, 404, 503]) {
    const capture = request(); capture.response.status = status
    const draft = await draftFromDevtoolsRequest(capture, 'https://app.example.com')
    assert.equal(draft.status, status < 200 ? 200 : status)
  }
})

function event<T>() {
  const listeners = new Set<(value: T) => void>()
  return { addListener: (listener: (value: T) => void) => { listeners.add(listener) },
    removeListener: (listener: (value: T) => void) => { listeners.delete(listener) },
    emit: (value: T) => { for (const listener of listeners) listener(value) },
    get size() { return listeners.size } }
}

function captureHarness() {
  const onRequestFinished = event<chrome.devtools.network.Request>()
  const onNavigated = event<string>()
  const snapshots: ((log: HARFormatLog) => void)[] = []
  let latest: CapturedRequest[] = []
  let navigations = 0
  const observer = observeDevtoolsRequests({ onRequestFinished, onNavigated, getHAR: callback => { snapshots.push(callback) } },
    requests => { latest = requests }, () => { navigations++ })
  return { observer, onRequestFinished, onNavigated,
    finish: (capture: DevtoolsRequest) => onRequestFinished.emit(capture as chrome.devtools.network.Request),
    hydrate: (entries: DevtoolsRequest[], index = 0) => snapshots.at(index)!({ entries } as HARFormatLog),
    get latest() { return latest }, get navigations() { return navigations } }
}

test('only explicitly classified Fetch/XHR calls appear, even when other requests return JSON', () => {
  const app = captureHarness()
  app.hydrate(['document', 'script', 'image', 'font', 'ping', 'other', 'preflight', undefined, null]
    .map(_resourceType => request({ _resourceType })))
  assert.equal(app.latest.length, 0)
  app.finish(request({ _resourceType: 'Fetch' }))
  app.finish(request({ _resourceType: 'xhr' }))
  assert.equal(app.latest.length, 2)
  app.observer.dispose()
})

test('initial and live captures merge without duplicates, filter unsupported resources and defer reading bodies', () => {
  const app = captureHarness()
  const first = request({ getContent: () => assert.fail('must not read bodies until selected') })
  app.finish(first)
  const unknownDocument = request({ _resourceType: null })
  unknownDocument.response.content.mimeType = 'text/html'
  app.hydrate([first, request({ _resourceType: 'image' }), unknownDocument])
  assert.equal(app.latest.length, 1)
  const next = request({ startedDateTime: '2026-10-28T12:01:00.000Z' })
  app.finish(next)
  assert.equal(app.latest[0].request, next)
  app.observer.dispose()
  assert.equal(app.onRequestFinished.size, 0)
  assert.equal(app.onNavigated.size, 0)
})

test('refresh loads requests missed by live notifications without duplicating existing captures', () => {
  const app = captureHarness()
  app.hydrate([])
  const first = request()
  app.observer.refresh()
  app.hydrate([first], -1)
  assert.equal(app.latest.length, 1)
  app.observer.refresh()
  const next = request({ startedDateTime: '2026-10-28T12:01:00.000Z' })
  app.hydrate([first, next], -1)
  assert.equal(app.latest.length, 2)
  assert.equal(app.latest[0].request, next)
  app.observer.dispose()
})

test('a newer refresh and navigation prevent older HAR snapshots from restoring stale requests', () => {
  const app = captureHarness()
  app.observer.refresh()
  app.hydrate([], -1)
  app.hydrate([request()], 0)
  assert.equal(app.latest.length, 0)
  app.onNavigated.emit('https://other.example.com')
  const next = request({ startedDateTime: '2026-10-28T12:01:00.000Z' })
  app.hydrate([next], -1)
  app.hydrate([request()], 0)
  assert.equal(app.latest.length, 1)
  assert.equal(app.latest[0].request, next)
  app.observer.dispose()
})

test('capture history is bounded and navigation or clearing prevents stale hydration', () => {
  const app = captureHarness()
  app.hydrate(Array.from({ length: 205 }, (_, i) => request({ startedDateTime: new Date(i).toISOString() })))
  assert.equal(app.latest.length, 200)
  assert.equal(app.latest[0].request.startedDateTime, new Date(204).toISOString())
  app.onNavigated.emit('https://other.example.com')
  assert.equal(app.navigations, 1)
  assert.equal(app.latest.length, 0)
  app.observer.dispose()

  for (const action of ['clear', 'dispose', 'navigate'] as const) {
    const pending = captureHarness()
    if (action === 'navigate') pending.onNavigated.emit('https://other.example.com')
    else pending.observer[action]()
    pending.hydrate([request()])
    assert.equal(pending.latest.length, 0)
    pending.observer.dispose()
  }
})

test('parallel calls to the same URL in one millisecond stay independently selectable across hydration', () => {
  const app = captureHarness()
  const first = request()
  const second = request()
  app.finish(first)
  app.hydrate([first, second])
  assert.equal(app.latest.length, 2)
  assert.notEqual(app.latest[0].id, app.latest[1].id)
  const previousIds = app.latest.map(capture => capture.id)
  app.finish(request())
  assert.equal(app.latest.length, 3)
  assert.deepEqual(app.latest.slice(1).map(capture => capture.id), previousIds)
  app.observer.dispose()
})

test('saving and activation retry update one rule, preserve unrelated rules and reject invalid drafts before writing', async () => {
  const previous = globalThis.chrome
  let stored: unknown[] = []
  let writes = 0
  let activationFails = true
  Object.assign(globalThis, { chrome: {
    storage: { local: { get: async () => ({ networkRules: structuredClone(stored) }), set: async (data: { networkRules: unknown[] }) => { writes++; stored = structuredClone(data.networkRules) } } },
    runtime: { sendMessage: async () => activationFails ? { ok: false, error: 'Activation failed' } : { ok: true, reloadTabIds: [7] } },
  } })
  try {
    const draft = await draftFromDevtoolsRequest(request(), 'https://app.example.com')
    const id = crypto.randomUUID()
    await assert.rejects(saveDevtoolsOverride(id, draft), /Activation failed/)
    assert.equal(stored.length, 1)
    activationFails = false
    const unrelated = { ...draft, id: crypto.randomUUID(), order: 1 }
    stored.push(unrelated)
    const result = await saveDevtoolsOverride(id, { ...draft, body: 'updated' })
    assert.equal(result.entries.length, 2)
    assert.equal(result.entries[0].body, 'updated')
    assert.equal(result.entries[0].order, 0)
    assert.deepEqual(result.entries[1], unrelated)
    assert.deepEqual(result.reloadTabIds, [7])
    await assert.rejects(saveDevtoolsOverride(id, { ...draft, status: 0 }))
    assert.equal(writes, 2)
  } finally { Object.assign(globalThis, { chrome: previous }) }
})
