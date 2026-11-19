import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { createNetworkRuleDraft, networkRulesForPage, normalizeNetworkRules, requestUrlKey } from '../src/lib/network-rules.ts'
import type { NetworkRule } from '../src/lib/network-rules.ts'
import { getDomainPatterns, matchesPageDomain } from '../src/lib/pattern.ts'
import { NetworkActiveTabsSchema, NetworkAppliedSchema, NetworkBridgeFramesSchema, NetworkRuntimeMessageSchema, NetworkSettingsResponseSchema } from '../src/lib/settings-messages.ts'
import { resolveRules } from '../src/lib/resolve-rules.ts'
import { hasReferences } from '../src/lib/templates.ts'
import type { TemplateText } from '../src/lib/templates.ts'
import { normalizeVariables, variableValues } from '../src/lib/variables.ts'
import type { Variable } from '../src/lib/variables.ts'
import { createObservationRedaction } from '../src/lib/observation-redaction.ts'

const ref = (name: string) => ({ variable: name })
const tpl = (...parts: (string | { variable: string })[]): TemplateText => ({ template: parts })
const SENTINEL = 'sentinel-other-31d'

function event() {
  const listeners: ((...args: unknown[]) => unknown)[] = []
  return { addListener: (listener: (...args: unknown[]) => unknown) => listeners.push(listener), emit: (...args: unknown[]) => listeners.map(listener => listener(...args)) }
}

function worker(rules: NetworkRule[], initialVariables: Variable[], initialSession: Record<string, unknown> = {}) {
  let variables = initialVariables
  let tabs: { id: number; url: string }[] = []
  const sent: { tabId: number; message: Record<string, unknown> }[] = []
  const session = structuredClone(initialSession)
  const failing = new Set<number>()
  const failingFrames = new Set<number>()
  let frames = [{ frameId: 0, documentId: 'document', documentLifecycle: 'active' }]
  const observationRedaction = createObservationRedaction()
  const api = {
    runtime: { onMessage: event(), onInstalled: event(), onStartup: event() },
    storage: { onChanged: event(), local: { get: async (keys: string[]) => {
      assert.deepEqual(Array.from(keys), ['networkRules', 'variables'])
      return structuredClone({ networkRules: rules, variables })
    } }, session: { get: async () => structuredClone(session), set: async (next: Record<string, unknown>) => { Object.assign(session, structuredClone(next)) } } },
    tabs: { query: async () => tabs, onUpdated: event(), onRemoved: event(), onReplaced: event(),
      sendMessage: async (tabId: number, message: Record<string, unknown>, target: { frameId: number }) => {
        sent.push({ tabId, message: JSON.parse(JSON.stringify(message)) })
        if (failing.has(tabId) || failingFrames.has(target.frameId)) throw new Error('No receiving end')
        return { ok: true, needsReload: false }
      } },
    webNavigation: { onBeforeNavigate: event(), onCommitted: event(), onHistoryStateUpdated: event(), onErrorOccurred: event(),
      getAllFrames: async () => frames },
  }
  const source = readFileSync(new URL('../src/background/network.ts', import.meta.url), 'utf8').replace(/^import .*\r?\n/gm, '')
  runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023 } }).outputText, {
    chrome: api, console: { error() {} },
    NETWORK_STORAGE_KEY: 'networkRules', VARIABLES_STORAGE_KEY: 'variables',
    normalizeVariables, networkRulesForPage, normalizeNetworkRules, requestUrlKey, getDomainPatterns, matchesPageDomain,
    NetworkActiveTabsSchema, NetworkBridgeFramesSchema, NetworkAppliedSchema, NetworkRuntimeMessageSchema, resolveRules, hasReferences, variableValues,
    observationRedaction, recordingTokenForTab: () => null,
  })
  const message = (payload: unknown, sender: unknown = {}) => new Promise<Record<string, unknown>>(resolve => api.runtime.onMessage.emit(payload, sender, (value: unknown) => resolve(JSON.parse(JSON.stringify(value)))))
  return {
    api, sent, session, failing, failingFrames, observationRedaction,
    setTabs: (next: typeof tabs) => { tabs = next },
    setFrames: (next: typeof frames) => { frames = next },
    setVariables: (next: Variable[]) => { variables = next },
    sync: () => message({ type: 'sync-network-rules' }),
    pull: (tabId: number, url: string, frame = frames[0]) => message({ type: 'get-network-rules' }, { tab: { id: tabId, url }, ...frame }),
  }
}

const variables = (tenant: string): Variable[] => [
  { id: '00000000-0000-4000-8000-000000000061', name: 'TENANT', value: tenant },
  { id: '00000000-0000-4000-8000-000000000062', name: 'AUTH', value: 'acme-token' },
  { id: '00000000-0000-4000-8000-000000000063', name: 'OTHER', value: SENTINEL },
]
const rules: NetworkRule[] = [
  { ...createNetworkRuleDraft(), id: '00000000-0000-4000-8000-000000000071', name: 'Tenant mock', order: 0, url: tpl(ref('TENANT'), '.example.com'), mode: 'call-server',
    requestUrl: tpl('https://api.test/', ref('TENANT')), body: tpl('{"token":"', ref('AUTH'), '"}'), headers: [{ key: 'Content-Type', value: 'application/json' }] },
  { ...createNetworkRuleDraft(), id: '00000000-0000-4000-8000-000000000072', name: 'Other site', order: 1, url: 'other.test',
    requestUrl: 'https://api.test/other', body: tpl(ref('OTHER')) },
  { ...createNetworkRuleDraft(), id: '00000000-0000-4000-8000-000000000073', name: 'Broken', order: 2, url: 'acme.example.com',
    requestUrl: 'https://api.test/broken', body: tpl(ref('MISSING')) },
]

test('pages receive only their resolved active rules with template snapshots, never the variable set or other rules\' values', async () => {
  const app = worker(rules, variables('Acme'))
  app.setTabs([{ id: 1, url: 'https://acme.example.com/app' }, { id: 2, url: 'https://unrelated.test/' }])
  assert.deepEqual(await app.sync(), { ok: true, reloadTabIds: [] })
  const update = app.sent.find(item => item.tabId === 1 && item.message.type === 'update-network-rules')!.message
  const entries = update.entries as Record<string, unknown>[]
  assert.deepEqual(entries.map(entry => entry.name), ['Tenant mock'])
  assert.equal(entries[0].requestUrl, 'https://api.test/Acme')
  assert.equal(entries[0].body, '{"token":"acme-token"}')
  assert.deepEqual(entries[0].templated, { requestUrl: true, responseHeaders: false, body: true })
  assert.deepEqual((entries[0].execution as Record<string, unknown>).body, rules[0].body)
  assert.equal(NetworkSettingsResponseSchema.safeParse({ entries }).success, true)
  const serialized = JSON.stringify(app.sent)
  assert.doesNotMatch(serialized, new RegExp(SENTINEL))
  assert.doesNotMatch(serialized, /"variables"|"TENANT","value"/)
  assert.deepEqual((app.sent.find(item => item.tabId === 2)!.message.entries as unknown[]), [])
  assert.doesNotMatch(JSON.stringify(app.session), /Acme|acme-token/)
  const pulled = await app.pull(1, 'https://acme.example.com/other')
  assert.deepEqual((pulled.entries as Record<string, unknown>[]).map(entry => entry.id), [rules[0].id])
  assert.doesNotMatch(JSON.stringify(pulled), new RegExp(SENTINEL))
})

test('previous activation patterns come from resolved domains, so a value change still asks to reload a stale page', async () => {
  const app = worker(rules, variables('Acme'))
  // A page that pulled settings still needs a reload notice if it misses an update.
  await app.sync()
  await app.pull(1, 'https://acme.example.com/app')
  app.setTabs([{ id: 1, url: 'https://acme.example.com/app' }])
  app.failing.add(1)
  app.setVariables(variables('Globex'))
  app.api.storage.onChanged.emit({ variables: { newValue: variables('Globex') } }, 'local')
  assert.deepEqual(await app.sync(), { ok: true, reloadTabIds: [1] })
  const update = app.sent.filter(item => item.tabId === 1 && item.message.type === 'update-network-rules').at(-1)!.message
  assert.deepEqual(update.entries, [])
})

test('pulling settings persists the recipient and cannot clear another document’s protection', async () => {
  const host = 'https://acme.example.com/app'
  const child = { frameId: 2, documentId: 'child', documentLifecycle: 'active' }
  const oldUrl = requestUrlKey('https://api.test/Acme')!
  const app = worker(rules, variables('Acme'))
  app.setFrames([{ frameId: 0, documentId: 'document', documentLifecycle: 'active' }, child])
  await app.pull(1, host, child)
  assert.deepEqual(app.session.networkRuleActiveTabs, [1])

  const restarted = worker(rules, variables('ACME'), app.session)
  restarted.setFrames([{ frameId: 0, documentId: 'document', documentLifecycle: 'active' }, child])
  await restarted.pull(1, host)
  assert.equal(restarted.observationRedaction.protection(1).unknownUrls, true)

  app.setTabs([{ id: 1, url: host }])
  app.setVariables(variables('ACME'))
  app.failingFrames.add(child.frameId)
  assert.deepEqual(await app.sync(), { ok: true, reloadTabIds: [1] })
  await app.pull(1, host)
  assert.equal(app.observationRedaction.protection(1).urls.has(oldUrl), true)
  app.failingFrames.clear()
  await app.sync()
  assert.equal(app.observationRedaction.protection(1).urls.has(oldUrl), false)
})

test('a cached document keeps URL protection across navigation, frame ID reuse, and worker restart', async () => {
  const app = worker(rules, variables('Acme'))
  const tabId = 1
  const address = 'https://acme.example.com/app'
  const original = { frameId: 0, documentId: 'old', documentLifecycle: 'active' }
  const other = { frameId: 0, documentId: 'current', documentLifecycle: 'active' }
  await app.pull(tabId, address, original)
  app.setVariables(variables('Globex'))
  app.setTabs([{ id: tabId, url: 'https://unrelated.test/' }])
  app.setFrames([other])
  await app.sync()
  assert.equal(app.observationRedaction.protection(tabId).urls.has(requestUrlKey('https://api.test/Acme')!), true)
  assert.deepEqual(app.session.networkRuleBridgeFrames, [{ tabId, frames: [{ frameId: 0, documentId: 'old', protectsUrl: true }] }])

  const restarted = worker(rules, variables('Globex'), app.session)
  restarted.setTabs([{ id: tabId, url: 'https://unrelated.test/' }])
  restarted.setFrames([other])
  await restarted.sync()
  assert.equal(restarted.observationRedaction.protection(tabId).unknownUrls, true)
  restarted.setFrames([original])
  restarted.setTabs([{ id: tabId, url: address }])
  await restarted.sync()
  assert.equal(restarted.observationRedaction.protection(tabId).unknownUrls, false)
  assert.deepEqual(restarted.session.networkRuleActiveTabs, [])
})

test('cached recipients acknowledge a new variable URL on separate visits after a worker restart', async () => {
  const app = worker(rules, variables('Acme'))
  const address = 'https://acme.example.com/app'
  const first = { frameId: 0, documentId: 'first', documentLifecycle: 'active' }
  const second = { frameId: 0, documentId: 'second', documentLifecycle: 'active' }
  await app.pull(1, address, first)
  await app.pull(1, address, second)

  const restarted = worker(rules, variables('ACME'), app.session)
  restarted.setTabs([{ id: 1, url: address }])
  restarted.setFrames([first])
  await restarted.sync()
  assert.equal(restarted.observationRedaction.protection(1).unknownUrls, true, 'the cached second document could still use its old URL')
  restarted.setFrames([second])
  await restarted.sync()
  const protection = restarted.observationRedaction.protection(1)
  assert.equal(protection.unknownUrls, false, 'both documents have acknowledged replacement now')
  assert.deepEqual([...protection.urls], [requestUrlKey('https://api.test/ACME')])
})
