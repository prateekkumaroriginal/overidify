import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

test('header observations pair each redirect and authentication leg separately', async () => {
  function event() {
    const listeners = new Set<(...args: unknown[]) => void>()
    return {
      addListener: (listener: (...args: unknown[]) => void) => listeners.add(listener),
      removeListener: (listener: (...args: unknown[]) => void) => listeners.delete(listener),
      emit: (...args: unknown[]) => listeners.forEach(listener => listener(...args)),
    }
  }
  const packets: { type: string; observationId?: string; requestId?: string; stage?: string; url?: string }[] = []
  const port = { name: 'overidify-executions', sender: { id: 'extension', url: 'chrome-extension://extension/devtools.html' }, onMessage: event(), onDisconnect: event(), postMessage: (message: typeof packets[number]) => packets.push(message) }
  const runtime = { id: 'extension', getURL: () => 'chrome-extension://extension/', onConnect: event(), onMessage: event() }
  const webRequest = { onBeforeSendHeaders: event(), onSendHeaders: event(), onBeforeRedirect: event(), onCompleted: event(), onErrorOccurred: event() }
  const source = readFileSync(new URL('../src/background/executions.ts', import.meta.url), 'utf8').replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '')
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023 } }).outputText
  let sequence = 0
  runInNewContext(code, { crypto: { randomUUID: () => `identity-${++sequence}` }, setTimeout: () => 1, clearTimeout() {},
    chrome: { runtime, webRequest, tabs: { sendMessage: async () => undefined }, storage: { session: { get: async () => ({ executionLastPoll: Date.now() }) } } } })
  runtime.onConnect.emit(port)
  port.onMessage.emit({ type: 'subscribe', tabId: 1, since: Date.now() })
  await new Promise(resolve => setImmediate(resolve))
  const leg = (url: string) => {
    const details = { requestId: 'same-browser-id', url, method: 'GET', requestHeaders: [], timeStamp: Date.now() }
    webRequest.onBeforeSendHeaders.emit(details)
    webRequest.onSendHeaders.emit(details)
  }
  leg('https://example.test/old')
  webRequest.onBeforeRedirect.emit({ requestId: 'same-browser-id' })
  leg('https://example.test/new')
  // An authentication retry can reuse the request ID and URL without a redirect.
  leg('https://example.test/new')
  const observations = packets.filter(packet => packet.type === 'request-observation')
  assert.equal(observations.length, 6)
  assert.equal(new Set(observations.map(packet => packet.observationId)).size, 3)
  for (let index = 0; index < observations.length; index += 2) {
    assert.ok(observations[index].observationId)
    assert.equal(observations[index].observationId, observations[index + 1].observationId)
    assert.equal(observations[index].requestId, 'same-browser-id')
    assert.equal(observations[index].url, observations[index + 1].url)
    assert.equal(observations[index].stage, 'onBeforeSendHeaders')
    assert.equal(observations[index + 1].stage, 'onSendHeaders')
  }
  port.onDisconnect.emit()
})
