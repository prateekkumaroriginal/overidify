import assert from 'node:assert/strict'
import { test } from 'node:test'
import { devtoolsRequestLabel, devtoolsRequestUnsupportedReason, draftFromDevtoolsRequest, observeDevtoolsRequests, saveDevtoolsOverride } from '../src/lib/devtools-requests.ts'
import type { CapturedRequest, DevtoolsRequest } from '../src/lib/devtools-requests.ts'
import { matchesNetworkRequest } from '../src/lib/network-rules.ts'
import { matchesPageDomain } from '../src/lib/pattern.ts'

test('request labels switch between file name and full path without changing queries or encoded URL text', () => {
  for (const [path, name] of [
    ['/b/c/x?y=z&next=/other', 'x?y=z&next=/other'],
    ['/?q=1', '/?q=1'],
    ['/b/c/', 'c/'],
    ['/b/a%20file.json?q=%2F', 'a%20file.json?q=%2F'],
  ]) {
    const url = `https://example.com:8080${path}`
    assert.deepEqual(devtoolsRequestLabel(url, false), { name, host: 'example.com:8080' })
    assert.deepEqual(devtoolsRequestLabel(url, true), { name: path, host: 'example.com:8080' })
  }
})

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

test('the list and draft creation agree on text MIME types without reading unsupported bodies', async () => {
  for (const mimeType of ['', 'text/plain', 'text/html; charset=utf-8', 'application/json', 'application/problem+json', 'application/xml', 'application/soap+xml', 'application/javascript', 'application/x-www-form-urlencoded', 'application/graphql', 'application/x-ndjson']) {
    const capture = request()
    capture.response.content.mimeType = mimeType
    assert.equal(devtoolsRequestUnsupportedReason(capture), null, mimeType)
    assert.equal((await draftFromDevtoolsRequest(capture, 'https://app.example.com')).body, ' {"chats": []}\n')
  }
  for (const mimeType of ['image/png', 'application/pdf', 'application/octet-stream', 'audio/mpeg', 'video/mp4']) {
    const capture = request({ getContent: () => assert.fail('unsupported response bodies must not be read') })
    capture.response.content.mimeType = mimeType
    const reason = devtoolsRequestUnsupportedReason(capture)
    assert.ok(reason?.includes(mimeType))
    await assert.rejects(draftFromDevtoolsRequest(capture, 'https://app.example.com'), { message: reason })
  }
})

test('unsupported request metadata supplies the same reason in the list and draft creation', async () => {
  for (const capture of [
    request({ _resourceType: 'script' }),
    request({ request: { method: 'TRACE', url: 'https://api.example.com' } }),
    request({ request: { method: 'GET', url: 'file:///local' } }),
  ]) {
    capture.getContent = () => assert.fail('unsupported response bodies must not be read')
    const reason = devtoolsRequestUnsupportedReason(capture)
    assert.ok(reason)
    await assert.rejects(draftFromDevtoolsRequest(capture, 'https://app.example.com'), { message: reason })
  }
})

test('response read failures are identifiable as unavailable captures', async () => {
  for (const getContent of [
    (callback: (content: string, encoding: string) => void) => callback(undefined as unknown as string, ''),
    (callback: (content: string, encoding: string) => void) => callback('/w==', 'base64'),
    (callback: (content: string, encoding: string) => void) => callback('body', 'unknown'),
    () => { throw new Error('unavailable') },
  ]) {
    await assert.rejects(draftFromDevtoolsRequest(request({ getContent }), 'https://app.example.com'), { name: 'DevtoolsResponseUnavailableError' })
  }
})

test('invalid headers and non-website scopes remain ordinary draft errors', async () => {
  const invalidHeader = request(); invalidHeader.response.headers.push({ name: 'X-Broken', value: 'a\r\nb' })
  await assert.rejects(draftFromDevtoolsRequest(invalidHeader, 'https://app.example.com'), { name: 'Error' })
  await assert.rejects(draftFromDevtoolsRequest(request(), 'chrome://extensions'), { name: 'Error' })
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
  const observer = observeDevtoolsRequests({ onRequestFinished, onNavigated, getHAR: callback => { snapshots.push(callback) } },
    requests => { latest = requests })
  return { observer, onRequestFinished, onNavigated,
    finish: (capture: DevtoolsRequest) => onRequestFinished.emit(capture as chrome.devtools.network.Request),
    hydrate: (entries: DevtoolsRequest[], index = 0) => snapshots.at(index)!({ entries } as HARFormatLog),
    get latest() { return latest } }
}

test('unavailable state belongs to one capture and survives refresh, while a fresh call stays eligible', () => {
  const app = captureHarness()
  const first = request()
  app.hydrate([first])
  const id = app.latest[0].id
  app.observer.markUnavailable(id, 'Chrome could not read this captured response.')
  assert.equal(app.latest[0].unavailableReason, 'Chrome could not read this captured response.')
  app.observer.refresh()
  app.hydrate([first], -1)
  assert.equal(app.latest[0].id, id)
  assert.equal(app.latest[0].unavailableReason, 'Chrome could not read this captured response.')
  const next = request({ startedDateTime: '2026-10-28T12:01:00.000Z' })
  app.finish(next)
  assert.equal(app.latest[1].unavailableReason, undefined)
  assert.equal(devtoolsRequestUnsupportedReason(app.latest[1].request), null)
  app.observer.clear()
  app.observer.markUnavailable(id, 'Late read failure')
  assert.equal(app.latest.length, 0, 'a late failure cannot restore a cleared capture')
  app.observer.dispose()
})

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

test('unsupported Fetch/XHR captures remain available for the display filter across refreshes', () => {
  const app = captureHarness()
  const image = request({ getContent: () => assert.fail('listing must not read response bodies') })
  image.response.content.mimeType = 'image/png'
  const trace = request({ request: { method: 'TRACE', url: 'https://api.example.com' } })
  const data = request({ request: { method: 'GET', url: 'data:text/plain,hello' } })
  app.finish(image)
  app.hydrate([image, trace, data])
  assert.equal(app.latest.length, 3)
  assert.ok(app.latest.every(item => devtoolsRequestUnsupportedReason(item.request)))
  app.observer.refresh()
  app.hydrate([image, trace, data], -1)
  assert.equal(app.latest.length, 3, 'refresh must not duplicate unsupported captures')
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
  assert.equal(app.latest.at(-1)!.request, next)
  app.observer.dispose()
  assert.equal(app.onRequestFinished.size, 0)
  assert.equal(app.onNavigated.size, 0)
})

test('refresh orders captures oldest to newest, including calls missed by live notifications', () => {
  const app = captureHarness()
  app.hydrate([])
  const first = request()
  app.observer.refresh()
  app.hydrate([first], -1)
  assert.equal(app.latest.length, 1)
  app.observer.refresh()
  const next = request({ startedDateTime: '2026-10-28T12:01:00.000Z' })
  app.hydrate([next, first], -1)
  assert.deepEqual(app.latest.map(item => item.request), [first, next])
  const earlier = request({ startedDateTime: '2026-10-28T11:59:00.000Z' })
  app.finish(earlier)
  assert.deepEqual(app.latest.map(item => item.request), [earlier, first, next], 'a slow older request keeps its chronological position')
  app.observer.dispose()
})

test('navigation keeps existing rows and IDs while refreshing and appending new captures', () => {
  const app = captureHarness()
  const first = request()
  app.hydrate([first])
  const firstId = app.latest[0].id
  app.onNavigated.emit('https://app.example.com/next')
  assert.equal(app.latest.length, 1, 'navigation must not publish an empty list')
  assert.equal(app.latest[0].id, firstId)
  app.hydrate([], -1)
  assert.equal(app.latest[0].id, firstId, 'an empty navigation snapshot must not erase existing captures')
  const next = request({ startedDateTime: '2026-10-28T12:01:00.000Z' })
  app.finish(next)
  const nextId = app.latest[1].id
  app.onNavigated.emit('https://other.example.com')
  app.hydrate([first, next], -1)
  assert.deepEqual(app.latest.map(item => item.id), [firstId, nextId], 'refresh must merge without duplicating retained captures')
  app.observer.clear()
  assert.equal(app.latest.length, 0)
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

test('capture history has no fixed request-count cap and clearing or disposal prevents stale hydration', () => {
  const app = captureHarness()
  app.hydrate(Array.from({ length: 1000 }, (_, i) => request({ startedDateTime: new Date(i).toISOString() })).reverse())
  assert.equal(app.latest.length, 1000)
  assert.deepEqual(app.latest.map(item => item.request.startedDateTime), Array.from({ length: 1000 }, (_, i) => new Date(i).toISOString()))
  const oldestId = app.latest[0].id
  app.finish(request({ startedDateTime: new Date(1000).toISOString() }))
  assert.equal(app.latest.length, 1001)
  assert.equal(app.latest[0].id, oldestId, 'new captures must not evict the oldest request')
  assert.equal(app.latest.at(-1)!.request.startedDateTime, new Date(1000).toISOString())
  app.observer.dispose()

  for (const action of ['clear', 'dispose'] as const) {
    const pending = captureHarness()
    pending.observer[action]()
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
  assert.deepEqual(app.latest.slice(0, -1).map(capture => capture.id), previousIds)
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
