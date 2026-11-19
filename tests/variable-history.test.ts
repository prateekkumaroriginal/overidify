import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { resolveRules } from '../src/lib/resolve-rules.ts'
import type { ActiveNetworkRule } from '../src/lib/resolve-rules.ts'
import { createNetworkRuleDraft } from '../src/lib/network-rules.ts'
import type { HeaderRule } from '../src/lib/types.ts'
import type { TemplateText } from '../src/lib/templates.ts'
import { createObservationRedaction, DETAILS_HIDDEN, emptyLayer, mergeLayers, redactObservation, URL_HIDDEN } from '../src/lib/observation-redaction.ts'
import type { ExecutionRecord } from '../src/lib/execution-history.ts'

const SENTINEL = 'sentinel-7c1e9b'
const ref = (name: string) => ({ variable: name })
const tpl = (...parts: (string | { variable: string })[]): TemplateText => ({ template: parts })

let session: Record<string, unknown> = {}
let installed: chrome.declarativeNetRequest.Rule[] = []
let failInstall = false
Object.assign(globalThis, { chrome: {
  storage: { session: { get: async () => structuredClone(session), set: async (next: Record<string, unknown>) => { session = { ...session, ...structuredClone(next) } } } },
  declarativeNetRequest: {
    ResourceType: Object.fromEntries(['SUB_FRAME', 'STYLESHEET', 'SCRIPT', 'IMAGE', 'FONT', 'OBJECT', 'XMLHTTPREQUEST', 'PING', 'CSP_REPORT', 'MEDIA', 'WEBSOCKET', 'WEBBUNDLE', 'OTHER'].map(type => [type, type.toLowerCase()])),
    getDynamicRules: async () => [], getSessionRules: async () => structuredClone(installed),
    updateSessionRules: async (update: chrome.declarativeNetRequest.UpdateRuleOptions) => {
      if (failInstall) throw new Error(`Rule with id 1001 has an invalid value "${SENTINEL}"`)
      installed = structuredClone(update.addRules ?? [])
    },
  },
} })
const { syncRequestHeaderSessionRules, readHeaderInstallations, headerActivationMessage } = await import('../src/lib/dnr.ts')

const tab = { id: 4, url: 'http://localhost:4200/app' }
const rule = (patch: Partial<HeaderRule> = {}): HeaderRule => ({ kind: 'header-rule', id: '00000000-0000-4000-8000-000000000041', name: 'API auth', url: 'localhost:4200',
  enabled: true, order: 0, headers: [{ key: 'Authorization', value: tpl('Bearer ', ref('AUTH')) }, { key: tpl('X-', ref('NAME')), value: 'literal' }, { key: 'Accept', value: 'json' }], ...patch })
const active = (rules: HeaderRule[], values: Record<string, string>) => resolveRules({ requestHeaderRules: rules, networkRules: [] }, new Map(Object.entries(values))).requestHeaderRules

test('installed session rules carry resolved values while the ledger and session storage keep templates only', async () => {
  session = {}; installed = []
  const transitions: unknown[] = []
  await syncRequestHeaderSessionRules(active([rule()], { AUTH: SENTINEL, NAME: 'Tenant' }), [tab], {
    beforeInstall: (previous, next) => transitions.push([[...previous], [...next].map(([id, map]) => [id, map && [...map]])]),
  })
  assert.deepEqual(installed[0].action.requestHeaders, [
    { header: 'Authorization', operation: 'set', value: `Bearer ${SENTINEL}` },
    { header: 'X-Tenant', operation: 'set', value: 'literal' },
    { header: 'Accept', operation: 'set', value: 'json' },
  ])
  assert.doesNotMatch(JSON.stringify(session), new RegExp(SENTINEL))
  const [installation] = await readHeaderInstallations()
  assert.deepEqual(installation.rule.headers, rule().headers)
  assert.deepEqual(transitions, [[[], [[4, [['authorization', 'value'], ['x-tenant', 'drop']]]]]])

  // A value change alone keeps the identical template snapshot and reuses the installation identity.
  const id = installed[0].id
  await syncRequestHeaderSessionRules(active([rule()], { AUTH: 'rotated', NAME: 'Tenant' }), [tab])
  assert.equal(installed[0].id, id)
  assert.equal(installed[0].action.requestHeaders?.[0].value, 'Bearer rotated')
})

test('an invalid resolved header is excluded before DNR so other rules still install', async () => {
  session = {}; installed = []
  const good = rule({ id: '00000000-0000-4000-8000-000000000042', headers: [{ key: 'X-Good', value: 'yes' }] })
  const bad = rule({ headers: [{ key: 'X-Bad', value: tpl(ref('AUTH')) }] })
  await syncRequestHeaderSessionRules(active([bad, good], { AUTH: 'line\r\nbreak' }), [tab])
  assert.deepEqual(installed.map(entry => entry.action.requestHeaders?.[0].header), ['X-Good'])
})

test('a browser rejection is reported with application text, keeping the previous settings protected', async () => {
  session = {}; installed = []
  failInstall = true
  const settled: boolean[] = []
  try {
    const error = await syncRequestHeaderSessionRules(active([rule()], { AUTH: SENTINEL, NAME: 'N' }), [tab], { afterInstall: ok => settled.push(ok) }).catch(error => error)
    assert.equal(headerActivationMessage(error), 'The browser did not apply the header rules. Reload the extension and try again.')
    assert.doesNotMatch(String(error), new RegExp(SENTINEL))
    assert.doesNotMatch(headerActivationMessage(new Error(SENTINEL)), new RegExp(SENTINEL))
    assert.deepEqual(settled, [false])
  } finally { failInstall = false }
})

test('observation redaction hides values and names Overidify set from variables and keeps unrelated details', () => {
  const layer = mergeLayers([{ headers: new Map([['authorization', 'value' as const], ['x-tenant', 'drop' as const]]), urls: new Set(), unknownHeaders: false, unknownUrls: false }])
  const result = redactObservation('https://api.test/me', [
    { name: 'Authorization', value: `Bearer ${SENTINEL}` }, { name: 'X-Tenant', value: SENTINEL }, { name: 'Accept', value: 'json' },
  ], layer)
  assert.deepEqual(result, { url: 'https://api.test/me', headers: [{ key: 'Authorization', value: { hidden: 'variable' } }, { key: 'Accept', value: 'json' }], hiddenHeaders: 1 })
})

test('activation keeps all possible configurations until the browser or all documents acknowledge replacement', () => {
  const redaction = createObservationRedaction()
  assert.equal(redaction.protection(1).unknownHeaders, true)
  assert.equal(redaction.protection(1).unknownUrls, true)
  redaction.initializeNetwork([[1, 'page']])
  const oldHeaders = new Map([['x-old', 'value' as const]])
  const newHeaders = new Map([['x-new', 'drop' as const]])
  const settle = redaction.headerTransition(new Map([[1, oldHeaders]]), new Map([[1, newHeaders]]))
  assert.deepEqual([...redaction.protection(1).headers], [['x-old', 'value'], ['x-new', 'drop']])
  assert.equal(redaction.protection(1).unknownUrls, true)
  settle(false)
  assert.deepEqual([...redaction.protection(1).headers], [['x-old', 'value'], ['x-new', 'drop']])
  redaction.headerTransition(new Map([[1, oldHeaders]]), new Map([[1, newHeaders]]))(true)
  assert.deepEqual([...redaction.protection(1).headers], [['x-new', 'drop']])

  const acknowledge = redaction.networkSettingsSent(1, 'page', new Set(['key-a']))
  redaction.networkSettingsSent(1, 'page', new Set(['key-b']))
  assert.equal(acknowledge(), false, 'an acknowledgment for an earlier URL cannot retire settings after a newer delivery')
  assert.equal(redaction.protection(1).unknownUrls, true)
  redaction.networkSettingsSent(1, 'page', new Set(['key-b']))()
  assert.equal(redaction.protection(1).unknownUrls, false)
  assert.deepEqual([...redaction.protection(1).urls], ['key-b'])
  redaction.networkSettingsSent(1, 'page', new Set())
  assert.deepEqual([...redaction.protection(1).urls], ['key-b'])
  redaction.networkSettingsSent(1, 'page', new Set())()
  assert.deepEqual([...redaction.protection(1).urls], [])
})

test('the worker posts redacted observations, including across a restart and an activation change, never the inserted value', async () => {
  function event() {
    const listeners = new Set<(...args: unknown[]) => void>()
    return { addListener: (listener: (...args: unknown[]) => void) => listeners.add(listener), removeListener: (listener: (...args: unknown[]) => void) => listeners.delete(listener),
      emit: (...args: unknown[]) => listeners.forEach(listener => listener(...args)) }
  }
  const packets: Record<string, unknown>[] = []
  const port = { name: 'overidify-executions', sender: { id: 'extension', url: 'chrome-extension://extension/devtools.html' }, onMessage: event(), onDisconnect: event(), postMessage: (message: Record<string, unknown>) => packets.push(message) }
  const runtime = { id: 'extension', getURL: () => 'chrome-extension://extension/', onConnect: event(), onMessage: event() }
  const webRequest = { onBeforeRequest: event(), onBeforeSendHeaders: event(), onSendHeaders: event(), onBeforeRedirect: event(), onCompleted: event(), onErrorOccurred: event() }
  const source = readFileSync(new URL('../src/background/executions.ts', import.meta.url), 'utf8').replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '')
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023 } }).outputText
  const observationRedaction = createObservationRedaction()
  runInNewContext(code, { observationRedaction, emptyLayer, mergeLayers, redactObservation, crypto, setTimeout: () => 1, clearTimeout() {},
    chrome: { runtime, webRequest, tabs: { sendMessage: async () => undefined }, storage: { session: { get: async () => ({ executionLastPoll: Date.now() }) } } } })
  runtime.onConnect.emit(port)
  port.onMessage.emit({ type: 'subscribe', tabId: 1, since: Date.now() })
  await new Promise(resolve => setImmediate(resolve))
  let sequence = 0
  const details = (url: string) => ({ requestId: `r${++sequence}`, url, method: 'GET', timeStamp: Date.now(),
    requestHeaders: [{ name: 'Authorization', value: `Bearer ${SENTINEL}` }, { name: 'Accept', value: 'json' }] })
  const leg = (request: ReturnType<typeof details>) => {
    webRequest.onBeforeSendHeaders.emit(request)
    webRequest.onSendHeaders.emit(request)
    return packets.filter(packet => packet.type === 'request-observation').slice(-2)
  }
  // No observed start means the worker cannot identify the settings.
  const [restart] = leg(details('https://api.test/one'))
  assert.equal(restart.detailsHidden, DETAILS_HIDDEN)
  assert.equal(restart.url, undefined)
  assert.equal(restart.headers, undefined)
  assert.equal(restart.method, 'GET')
  assert.ok(restart.observationId)

  observationRedaction.initializeNetwork([])
  observationRedaction.headerTransition(new Map(), new Map([[1, new Map([['authorization', 'value' as const]])]]))(true)
  observationRedaction.networkSettingsSent(1, 'page', new Set([JSON.stringify(['https://api.test', '/secret-path', []])]))()
  const request = details('https://api.test/secret-path')
  webRequest.onBeforeRequest.emit(request)
  // The settings are removed before the first send, even though the browser
  // could already have selected the old header action for this request.
  observationRedaction.headerTransition(new Map(), new Map())(true)
  observationRedaction.networkSettingsSent(1, 'page', new Set())()
  const firstLeg = leg(request)
  webRequest.onBeforeRedirect.emit(request)
  webRequest.onBeforeRequest.emit(request)
  const nextLeg = leg(request)
  for (const packet of [...firstLeg, ...nextLeg]) {
    assert.deepEqual(packet.headers, [{ key: 'Authorization', value: { hidden: 'variable' } }, { key: 'Accept', value: 'json' }])
    assert.equal(packet.urlOmitted, URL_HIDDEN)
    assert.equal(packet.url, undefined)
  }
  assert.notEqual(firstLeg[0].observationId, nextLeg[0].observationId)
  assert.doesNotMatch(JSON.stringify(packets), new RegExp(SENTINEL))
  webRequest.onCompleted.emit(request)
  const unrelated = details('https://api.test/secret-path')
  webRequest.onBeforeRequest.emit(unrelated)
  const [fresh] = leg(unrelated)
  assert.equal(fresh.url, unrelated.url)
  assert.deepEqual(fresh.headers, [{ key: 'Authorization', value: `Bearer ${SENTINEL}` }, { key: 'Accept', value: 'json' }])
  port.onDisconnect.emit()
})

test('interceptor records use the template snapshot and omit resolved URL, response headers, body, and error text', async () => {
  const { installNetworkInterceptors, REQUEST_URL_OMITTED } = await import('../src/network/interceptor.ts')
  class FakeXHR extends EventTarget {
    open() {} send() {} abort() {} getResponseHeader() { return null } getAllResponseHeaders() { return '' } overrideMimeType() {} setRequestHeader() {}
    get responseType() { return '' } set responseType(_value: string) { void _value }
    get readyState() { return 0 } get status() { return 0 } get statusText() { return '' } get responseURL() { return '' }
    get response() { return null } get responseText() { return '' } get responseXML() { return null }
  }
  const page = { fetch: async () => { throw new TypeError(`Failed to fetch ${SENTINEL}`) }, XMLHttpRequest: FakeXHR, EventTarget, Event, Request, Response, Headers, ReadableStream,
    TextEncoder, DOMException, URL, document: { baseURI: 'https://site.test/' }, setTimeout, clearTimeout } as unknown as Window & typeof globalThis
  const records: ExecutionRecord[] = []
  const interceptor = installNetworkInterceptors(page)
  interceptor.setExecutionReporter(record => records.push(record))
  const template = { ...createNetworkRuleDraft(), id: '00000000-0000-4000-8000-000000000051', name: tpl(ref('NAME'), ' mock'), order: 0, url: 'site.test',
    requestUrl: tpl('https://api.test/', ref('TENANT')), body: tpl('{"token":"', ref('AUTH'), '"}'), headers: [{ key: 'X-Token', value: tpl(ref('AUTH')) }] }
  const values = new Map([['NAME', 'Named'], ['TENANT', SENTINEL], ['AUTH', SENTINEL]])
  const [entry] = resolveRules({ requestHeaderRules: [], networkRules: [template] }, values).networkRules as ActiveNetworkRule[]
  interceptor.setNetworkRules([entry])
  const response = await page.fetch(`https://api.test/${SENTINEL}`)
  assert.equal(await response.text(), `{"token":"${SENTINEL}"}`, 'the page receives its resolved mock')
  assert.equal(response.headers.get('x-token'), SENTINEL)
  const [mocked] = records
  assert.equal(mocked.result, 'Mocked')
  assert.deepEqual(mocked.request, { urlOmitted: REQUEST_URL_OMITTED, method: 'GET', type: 'fetch' })
  assert.deepEqual(mocked.response, { status: 200, headers: template.headers, body: template.body })
  assert.deepEqual(mocked.rule.requestUrl, template.requestUrl)
  assert.deepEqual(mocked.rule.name, template.name)

  interceptor.setNetworkRules([{ ...entry, mode: 'call-server' }])
  await assert.rejects(page.fetch(`https://api.test/${SENTINEL}`))
  assert.equal(records[1].result, 'Failed')
  assert.equal(records[1].error, 'Request failed')
  const controller = new AbortController()
  const secretUrl = `https://api.test/${SENTINEL}`
  controller.abort(secretUrl)
  await assert.rejects(page.fetch(secretUrl, { signal: controller.signal }), error => error === secretUrl)
  assert.equal(records[2].error, 'Request aborted')
  assert.doesNotMatch(JSON.stringify(records), new RegExp(SENTINEL))
})
