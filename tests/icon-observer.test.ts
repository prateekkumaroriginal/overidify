import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/offscreen/main.ts', import.meta.url), 'utf8')
const observer = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023 } }).outputText
const workerSource = readFileSync(new URL('../src/background/action-icon.ts', import.meta.url), 'utf8')
const worker = ts.transpileModule(workerSource.replace(/^import .*\n/gm, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2023 },
}).outputText
const tick = () => new Promise<void>(resolve => setImmediate(resolve))

function harness(send: () => Promise<unknown> = async () => ({ ok: true })) {
  let dark = false
  let changed!: () => void
  let sample!: () => void
  let listener!: (message: unknown, sender: unknown, respond: (response: unknown) => void) => void
  const reports: string[] = []
  const errors: unknown[] = []
  const preference = {
    get matches() { return dark },
    addEventListener: (_event: string, listener: () => void) => { changed = listener },
  }
  runInNewContext(observer, {
    window: { matchMedia: () => preference },
    chrome: { runtime: {
      id: 'test', onMessage: { addListener: (callback: typeof listener) => { listener = callback } },
      sendMessage: async ({ theme }: { theme: string }) => { reports.push(theme); return send() },
    } },
    setInterval: (callback: () => void, interval: number) => {
      assert.equal(interval, 1000)
      sample = callback
    },
    console: { error: (...args: unknown[]) => errors.push(args) },
  })
  return { reports, errors, dark: (next: boolean) => { dark = next },
    read: () => new Promise<unknown>(resolve => listener({ type: 'read-icon-theme' }, { id: 'test' }, resolve)),
    sample: () => sample(), event: () => changed() }
}

for (const theme of ['light', 'dark']) {
  test(`failed initial ${theme} icon update retries without a theme change`, async () => {
    const url = 'chrome-extension://test/offscreen.html'
    let listener!: (message: unknown, sender: unknown, respond: (response: unknown) => void) => void
    const app = harness(() => new Promise(resolve => listener(
      { type: 'icon-theme-changed', theme }, { id: 'test', url }, resolve,
    )))
    app.dark(theme === 'dark')
    let attempts = 0
    const applied: string[] = []
    runInNewContext(worker, {
      chrome: {
        runtime: {
          id: 'test', getURL: () => url,
          getContexts: async () => [{}], sendMessage: () => app.read(),
          onMessage: { addListener: (callback: typeof listener) => { listener = callback } },
          onInstalled: { addListener: () => {} }, onStartup: { addListener: () => {} },
        },
        action: { setIcon: async ({ path }: { path: Record<number, string> }) => {
          if (++attempts === 1) throw new Error('transient startup icon failure')
          applied.push(path[16])
        } },
      },
      iconAssets: { light: { 16: 'light.png' }, dark: { 16: 'dark.png' } },
      console: { error: () => {} },
    })
    await tick()
    assert.equal(attempts, 1)
    assert.deepEqual(applied, [])
    app.sample()
    await tick()
    assert.deepEqual(applied, [`${theme}.png`])
    app.sample()
    await tick()
    assert.equal(attempts, 2)
  })
}

test('hidden theme changes are sampled without relying on a media event or waking the worker while unchanged', async () => {
  const app = harness()
  app.sample()
  await tick()
  assert.deepEqual(app.reports, ['light'])
  app.sample()
  await tick()
  assert.deepEqual(app.reports, ['light'])
  app.dark(true)
  app.sample()
  await tick()
  assert.deepEqual(app.reports, ['light', 'dark'])
  app.sample()
  app.event()
  await tick()
  assert.deepEqual(app.reports, ['light', 'dark'])
  app.dark(false)
  app.event()
  await tick()
  assert.deepEqual(app.reports, ['light', 'dark', 'light'])
})

test('failed theme messages are retried on the next sample until acknowledged', async () => {
  let attempts = 0
  const app = harness(async () => {
    if (++attempts === 1) throw new Error('worker unavailable')
    return { ok: attempts > 2 }
  })
  app.dark(true)
  for (let i = 0; i < 4; i++) { await app.read(); app.sample(); await tick() }
  assert.deepEqual(app.reports, ['dark', 'dark', 'dark'])
  assert.equal(app.errors.length, 2)
})

test('a theme change during an in-flight message is reported after that message completes', async () => {
  let complete!: (value: unknown) => void
  let first = true
  const app = harness(() => {
    if (!first) return Promise.resolve({ ok: true })
    first = false
    return new Promise(resolve => { complete = resolve })
  })
  app.dark(true)
  app.sample()
  app.dark(false)
  app.event()
  assert.deepEqual(app.reports, ['dark'])
  complete({ ok: true })
  await tick()
  app.sample()
  await tick()
  assert.deepEqual(app.reports, ['dark', 'light'])
})
