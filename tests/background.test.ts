import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import type { HeaderEntry } from '../src/lib/types.ts'
import type { PageTab } from '../src/lib/dnr.ts'

function event() {
  const listeners: ((...args: unknown[]) => unknown)[] = []
  return {
    addListener: (listener: (...args: unknown[]) => unknown) => listeners.push(listener),
    emit: (...args: unknown[]) => listeners.forEach((listener) => listener(...args)),
  }
}

const resourceTypes = Object.fromEntries([
  'MAIN_FRAME', 'SUB_FRAME', 'STYLESHEET', 'SCRIPT', 'IMAGE', 'FONT',
  'OBJECT', 'XMLHTTPREQUEST', 'PING', 'CSP_REPORT', 'MEDIA', 'WEBSOCKET',
  'WEBBUNDLE', 'OTHER',
].map((type) => [type, type.toLowerCase()]))
Object.assign(globalThis, { chrome: { declarativeNetRequest: { ResourceType: resourceTypes } } })
const { rulesToSessionRules } = await import('../src/lib/dnr.ts')

// Run the actual worker with isolated Chrome events and storage adapters.
const source = readFileSync(new URL('../src/background/index.ts', import.meta.url), 'utf8')
const worker = ts.transpileModule(source.replace(/^import .*\n/gm, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2023 },
}).outputText

function harness(initialTabs: PageTab[]) {
  let tabs = initialTabs
  let entries: HeaderEntry[] = [{
    kind: 'rule', id: 'localhost', name: 'Test', url: 'localhost:4200', enabled: true, order: 0,
    headers: [{ key: 'Origin', value: 'https://www.up50.co.in' }],
  }]
  let applied: chrome.declarativeNetRequest.Rule[] = []
  const errors: unknown[] = []
  const api = {
    runtime: { onInstalled: event(), onStartup: event(), onMessage: event() },
    storage: { onChanged: event() },
    tabs: {
      query: async () => tabs,
      onUpdated: event(), onCreated: event(), onRemoved: event(), onReplaced: event(),
    },
    webNavigation: { onBeforeNavigate: event(), onCommitted: event(), onErrorOccurred: event() },
  }
  runInNewContext(worker, {
    chrome: api,
    console: { error: (...args: unknown[]) => errors.push(args) },
    STORAGE_KEY: 'headerRules',
    getEntries: async () => entries,
    syncSessionRules: async (rules: HeaderEntry[], pages: PageTab[]) => {
      applied = JSON.parse(JSON.stringify(rulesToSessionRules(rules, pages)))
    },
  })
  return {
    api,
    setTabs: (next: PageTab[]) => { tabs = next },
    setEntries: (next: HeaderEntry[]) => { entries = next },
    tabIds: () => applied.flatMap((rule) => rule.condition.tabIds ?? []),
    flush: () => new Promise<void>((resolve, reject) => {
      api.runtime.onMessage.emit({ type: 'sync-header-rules' }, {}, (result: { ok: boolean; error?: string }) => {
        if (!result.ok) { reject(new Error(result.error)); return }
        assert.deepEqual(errors, [])
        resolve()
      })
    }),
  }
}

test('worker restores page rules on startup and updates them before navigation, including redirects', async () => {
  const app = harness([{ id: 1, url: 'http://localhost:4200/messages' }])
  await app.flush()
  assert.deepEqual(app.tabIds(), [1])

  // tabs.query still reports the old page while the navigation is in flight.
  app.api.webNavigation.onBeforeNavigate.emit({ tabId: 1, frameId: 0, url: 'http://localhost:4201/messages' })
  await app.flush()
  assert.deepEqual(app.tabIds(), [])

  app.api.webNavigation.onCommitted.emit({ tabId: 1, frameId: 0, url: 'http://localhost:4200/redirected' })
  await app.flush()
  assert.deepEqual(app.tabIds(), [1])

  // An embedded third-party frame belongs to the same website tab.
  app.api.webNavigation.onCommitted.emit({ tabId: 1, frameId: 2, url: 'https://embedded.example.com/' })
  await app.flush()
  assert.deepEqual(app.tabIds(), [1])

  app.api.tabs.onUpdated.emit(1, { url: 'https://other.example.com/' })
  await app.flush()
  assert.deepEqual(app.tabIds(), [])
})

test('worker handles failed navigations, opening, closing, replacing tabs, and storage changes', async () => {
  const app = harness([{ id: 1, url: 'http://localhost:4200/messages' }])
  await app.flush()
  app.api.webNavigation.onBeforeNavigate.emit({ tabId: 1, frameId: 0, url: 'https://unreachable.example.com/' })
  await app.flush()
  assert.deepEqual(app.tabIds(), [])
  app.api.webNavigation.onErrorOccurred.emit({ tabId: 1, frameId: 0 })
  await app.flush()
  assert.deepEqual(app.tabIds(), [1])

  app.setTabs([{ id: 1, url: 'http://localhost:4200/messages' }, { id: 2, url: 'http://localhost:4200/other' }])
  app.api.tabs.onCreated.emit({ id: 2, url: 'http://localhost:4200/other' })
  await app.flush()
  assert.deepEqual(app.tabIds(), [1, 2])

  app.setTabs([{ id: 2, url: 'http://localhost:4200/other' }])
  app.api.tabs.onRemoved.emit(1)
  await app.flush()
  assert.deepEqual(app.tabIds(), [2])

  app.setTabs([{ id: 3, url: 'http://localhost:4200/other' }])
  app.api.tabs.onReplaced.emit(3, 2)
  await app.flush()
  assert.deepEqual(app.tabIds(), [3])

  app.setEntries([])
  app.api.storage.onChanged.emit({ headerRules: { newValue: [] } }, 'local')
  await app.flush()
  assert.deepEqual(app.tabIds(), [])
})
