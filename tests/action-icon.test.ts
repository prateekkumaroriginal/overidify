import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/background/action-icon.ts', import.meta.url), 'utf8')
const worker = ts.transpileModule(source.replace(/^import .*\r?\n/gm, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2023 },
}).outputText
const tick = () => new Promise<void>(resolve => setImmediate(resolve))

function event() {
  const listeners: ((...args: unknown[]) => unknown)[] = []
  return {
    addListener: (listener: (...args: unknown[]) => unknown) => listeners.push(listener),
    emit: (...args: unknown[]) => listeners.map(listener => listener(...args)),
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

function harness(options: {
  existing?: boolean
  readTheme?: () => Promise<unknown>
  create?: () => Promise<void>
  apply?: () => Promise<void>
  storedTheme?: string
  restore?: () => Promise<Record<string, unknown>>
} = {}) {
  const url = 'chrome-extension://test/offscreen.html'
  const contexts = options.existing ? [{}] : []
  const started: string[] = []
  const applied: string[] = []
  const errors: unknown[] = []
  let creations = 0
  const stored: Record<string, unknown> = { browserIconTheme: options.storedTheme }
  const api = {
    storage: { session: {
      get: async () => options.restore ? options.restore() : stored,
      set: async (next: object) => { Object.assign(stored, next) },
    } },
    runtime: {
      id: 'test', getURL: (path: string) => `chrome-extension://test/${path}`,
      onMessage: event(), onInstalled: event(), onStartup: event(),
      getContexts: async () => contexts,
      sendMessage: async () => options.readTheme ? options.readTheme() : { theme: 'light' },
    },
    offscreen: {
      createDocument: async (details: { reasons: string[]; url: string }) => {
        creations++
        assert.equal(details.url, 'offscreen.html')
        assert.equal(details.reasons[0], 'MATCH_MEDIA')
        await options.create?.()
        contexts.push({})
      },
    },
    action: {
      setIcon: async ({ path }: { path: Record<number, string> }) => {
        started.push(path[16])
        await options.apply?.()
        applied.push(path[16])
      },
    },
  }
  runInNewContext(worker, {
    chrome: api, console: { error: (...args: unknown[]) => errors.push(args) },
    iconAssets: { light: { 16: 'light.png' }, dark: { 16: 'dark.png' } },
  })
  return {
    api, applied, started, errors, stored, creations: () => creations,
    async browserChange(theme: unknown, sender: object = { id: 'test', url: 'chrome-extension://test/options.html' }) {
      const response = deferred<unknown>()
      const results = api.runtime.onMessage.emit({ type: 'browser-icon-theme-changed', theme }, sender, response.resolve)
      return results.includes(true) ? response.promise : false
    },
    async change(theme: unknown, sender = { id: 'test', url }) {
      const response = deferred<unknown>()
      const results = api.runtime.onMessage.emit({ type: 'icon-theme-changed', theme }, sender, response.resolve)
      return results.includes(true) ? response.promise : false
    },
  }
}

test('icon observer starts once under concurrent lifecycle events and restores an existing observer', async () => {
  const creation = deferred<void>()
  const app = harness({ create: () => creation.promise })
  app.api.runtime.onInstalled.emit()
  app.api.runtime.onStartup.emit()
  await tick()
  assert.equal(app.creations(), 1)
  creation.resolve()
  await tick()
  assert.deepEqual(app.applied, ['light.png'])
  assert.deepEqual(app.errors, [])

  const restarted = harness({ existing: true, readTheme: async () => ({ theme: 'dark' }) })
  await tick()
  assert.equal(restarted.creations(), 0)
  assert.deepEqual(restarted.applied, ['dark.png'])
})

test('only validated theme changes from the offscreen observer can change the toolbar icon', async () => {
  const app = harness({ existing: true })
  await tick()
  assert.equal(await app.change('dark', { id: 'test', url: 'https://example.com/' }), false)
  assert.equal(await app.change('dark', { id: 'other', url: 'chrome-extension://test/offscreen.html' }), false)
  assert.equal(await app.change('unexpected'), false)
  assert.equal(await app.change(null), false)
  await app.change('dark')
  assert.deepEqual(app.applied, ['light.png', 'dark.png'])
})

test('a stale startup query cannot overwrite a live theme change', async () => {
  const query = deferred<unknown>()
  const app = harness({ existing: true, readTheme: () => query.promise })
  await tick()
  await app.change('dark')
  query.resolve({ theme: 'light' })
  await tick()
  assert.deepEqual(app.applied, ['dark.png'])
})

test('changes during observer creation do not suppress a newer startup query', async () => {
  const creation = deferred<void>()
  const app = harness({ create: () => creation.promise, readTheme: async () => ({ theme: 'light' }) })
  await tick()
  await app.change('dark')
  creation.resolve()
  await tick()
  assert.deepEqual(app.applied, ['dark.png', 'light.png'])
})

test('pending icon loads finish in order so the latest theme wins', async () => {
  const firstLoad = deferred<void>()
  let loads = 0
  const app = harness({ existing: true, apply: async () => {
    if (++loads === 1) await firstLoad.promise
  } })
  await tick()
  const changed = app.change('dark')
  await tick()
  assert.deepEqual(app.started, ['light.png'])
  firstLoad.resolve()
  await changed
  assert.deepEqual(app.applied, ['light.png', 'dark.png'])
})

test('observer creation failure retains the fallback and can retry on startup', async () => {
  let fail = true
  const app = harness({ create: async () => { if (fail) throw new Error('unavailable') } })
  await tick()
  assert.deepEqual(app.applied, [])
  assert.equal(app.errors.length, 1)
  fail = false
  app.api.runtime.onStartup.emit()
  await tick()
  assert.equal(app.creations(), 2)
  assert.deepEqual(app.applied, ['light.png'])
})

test('a failed icon update does not prevent later theme changes', async () => {
  let fail = true
  const app = harness({ existing: true, apply: async () => { if (fail) throw new Error('image load failed') } })
  await tick()
  assert.equal(app.errors.length, 1)
  fail = false
  await app.change('dark')
  assert.deepEqual(app.applied, ['dark.png'])
})

test('browser appearance overrides the offscreen OS theme and survives a worker restart', async () => {
  const app = harness({ existing: true, readTheme: async () => ({ theme: 'dark' }) })
  await tick()
  await app.browserChange('light')
  await app.change('dark')
  assert.equal(app.applied.at(-1), 'light.png')
  assert.equal(app.stored.browserIconTheme, 'light')

  const restarted = harness({ existing: true, storedTheme: 'light', readTheme: async () => ({ theme: 'dark' }) })
  await tick()
  await restarted.change('dark')
  assert.deepEqual(restarted.applied, ['light.png', 'light.png'])
})

test('only extension UI and active top-level websites can report browser appearance', async () => {
  const app = harness({ existing: true })
  await tick()
  const website = { id: 'test', url: 'https://example.com/', frameId: 0, tab: { active: true } }
  for (const sender of [
    { ...website, id: 'other' }, { ...website, frameId: 1 },
    { ...website, tab: { active: false } }, { ...website, tab: { active: true, incognito: true } },
    { ...website, url: 'chrome://settings/' }, { id: 'test', url: 'chrome-extension://test/unknown.html' },
    { id: 'test', url: 'chrome-extension://test/offscreen.html' },
  ]) assert.equal(await app.browserChange('dark', sender), false)
  assert.equal(await app.browserChange('unexpected', website), false)
  assert.deepEqual(app.applied, ['light.png'])
  await app.browserChange('dark', website)
  await app.browserChange('light', { id: 'test', url: 'chrome-extension://test/popup.html' })
  assert.deepEqual(app.applied, ['light.png', 'dark.png', 'light.png'])
})

test('a new browser theme takes precedence over delayed session restoration', async () => {
  const restore = deferred<Record<string, unknown>>()
  const app = harness({ existing: true, restore: () => restore.promise })
  const changed = app.browserChange('light')
  restore.resolve({ browserIconTheme: 'dark' })
  await changed
  await tick()
  assert.ok(app.applied.every(theme => theme === 'light.png'))
  assert.equal(app.stored.browserIconTheme, 'light')
})

test('an early offscreen report cannot discard a browser theme still being restored', async () => {
  const restore = deferred<Record<string, unknown>>()
  const app = harness({ existing: true, restore: () => restore.promise })
  const changed = app.change('dark')
  restore.resolve({ browserIconTheme: 'light' })
  await changed
  await tick()
  assert.ok(app.applied.length > 0)
  assert.ok(app.applied.every(theme => theme === 'light.png'))
})
