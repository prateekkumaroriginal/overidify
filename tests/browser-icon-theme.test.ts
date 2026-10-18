import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/icon-theme/main.ts', import.meta.url), 'utf8')
const reporter = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023 } }).outputText
const tick = () => new Promise<void>(resolve => setImmediate(resolve))

function harness(send: () => Promise<unknown> = async () => ({ ok: true }), subframe = false, incognito = false) {
  let dark = false
  let visible = true
  const events = new Map<string, () => void>()
  const timers = new Map<number, () => void>()
  const reports: string[] = []
  let nextTimer = 0
  const window = {
    top: undefined as unknown,
    matchMedia: () => ({ get matches() { return dark },
      addEventListener: (_type: string, listener: () => void) => events.set('change', listener) }),
    addEventListener: (type: string, listener: () => void) => events.set(type, listener),
    setTimeout: (callback: () => void) => { const id = ++nextTimer; timers.set(id, callback); return id },
    clearTimeout: (id: number) => timers.delete(id),
  }
  window.top = subframe ? {} : window
  runInNewContext(reporter, {
    window,
    document: { get visibilityState() { return visible ? 'visible' : 'hidden' },
      addEventListener: (type: string, listener: () => void) => events.set(type, listener) },
    chrome: { extension: { inIncognitoContext: incognito },
      runtime: { id: 'test', sendMessage: async ({ theme }: { theme: string }) => { reports.push(theme); return send() } } },
  })
  return { reports, dark: (value: boolean) => { dark = value }, visible: (value: boolean) => { visible = value },
    event: (type: string) => events.get(type)?.(),
    retry: () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(callback => callback()) } }
}

test('unsupported contexts are ignored and reactivation resynchronizes the global icon', async () => {
  const previewWindow: { top?: unknown } = {}
  previewWindow.top = previewWindow
  for (const chrome of [undefined, {}]) assert.doesNotThrow(() => runInNewContext(reporter, { window: previewWindow, chrome }))
  assert.deepEqual(harness(undefined, true).reports, [])
  assert.deepEqual(harness(undefined, false, true).reports, [])
  const app = harness()
  await tick()
  app.visible(false)
  app.dark(true)
  app.event('change')
  await tick()
  assert.deepEqual(app.reports, ['light'])
  app.visible(true)
  app.event('visibilitychange')
  await tick()
  assert.deepEqual(app.reports, ['light', 'dark'])

  // Another page can change the global icon even if this page's final theme
  // equals the value it last reported. Both activation events must reassert it.
  app.visible(false)
  app.dark(false)
  app.event('change')
  app.dark(true)
  app.event('change')
  app.visible(true)
  app.event('visibilitychange')
  await tick()
  app.event('focus')
  await tick()
  assert.deepEqual(app.reports, ['light', 'dark', 'dark', 'dark'])
})

test('failed reports retry the current theme until the worker acknowledges it', async () => {
  let attempts = 0
  const app = harness(async () => {
    if (++attempts === 1) throw new Error('worker unavailable')
    return { ok: attempts > 2 }
  })
  await tick()
  app.dark(true)
  for (let i = 0; i < 3; i++) { app.retry(); await tick() }
  assert.deepEqual(app.reports, ['light', 'dark', 'dark'])
})

test('a change during an outstanding report is sent immediately after acknowledgement', async () => {
  let complete!: (response: unknown) => void
  let first = true
  const app = harness(() => {
    if (!first) return Promise.resolve({ ok: true })
    first = false
    return new Promise(resolve => { complete = resolve })
  })
  app.dark(true)
  app.event('change')
  assert.deepEqual(app.reports, ['light'])
  complete({ ok: true })
  await tick()
  assert.deepEqual(app.reports, ['light', 'dark'])
})
