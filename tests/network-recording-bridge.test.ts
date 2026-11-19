import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { NetworkPageMessageSchema, NetworkRuntimeMessageSchema, NetworkSettingsResponseSchema } from '../src/lib/settings-messages.ts'

test('a delayed configuration response cannot turn off a newer recording session', async () => {
  const sent: { type: string; token?: string | null; id?: number }[] = []
  const requests: string[] = []
  let pageMessage: (event: unknown) => void = () => undefined
  let runtimeMessage: (message: unknown, sender: unknown, respond: (value: unknown) => void) => void = () => undefined
  let settings: (value: unknown) => void = () => undefined
  const pendingSettings = new Promise(resolve => { settings = resolve })
  const page = {
    setTimeout, clearTimeout,
    addEventListener(_type: string, listener: typeof pageMessage) { pageMessage = listener },
    postMessage(message: (typeof sent)[number]) {
      sent.push(message)
      if (message.type === 'hello' || message.type === 'config') queueMicrotask(() => pageMessage({ source: page,
        data: message.type === 'hello' ? { source: 'overidify-network-page', type: 'ready' }
          : { source: 'overidify-network-page', type: 'applied', id: message.id, needsReload: false } }))
    },
  }
  const source = readFileSync(new URL('../src/network/bridge.ts', import.meta.url), 'utf8').replace(/^import .*\r?\n/gm, '')
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023 } }).outputText
  runInNewContext(code, { window: page, NetworkPageMessageSchema, NetworkRuntimeMessageSchema, NetworkSettingsResponseSchema,
    chrome: { runtime: { sendMessage: ({ type }: { type: string }) => {
      requests.push(type)
      return type === 'get-network-rules' ? pendingSettings : Promise.resolve({ ok: true })
    }, onMessage: { addListener: (listener: typeof runtimeMessage) => { runtimeMessage = listener } } } } })
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(requests, ['network-page-ready', 'get-network-rules'])
  runtimeMessage({ type: 'record-network-executions', token: 'new-recording-session' }, {}, () => undefined)
  settings({ entries: [], recordingToken: null })
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(sent.slice(-2).map(message => [message.type, message.token]), [
    ['recording', 'new-recording-session'], ['config', undefined],
  ])
})
