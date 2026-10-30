import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getCapturedNetworkRuleDraft, openCapturedNetworkRule, saveCapturedNetworkRuleDraft } from '../src/lib/network-rule-drafts.ts'
import type { DevtoolsRequest } from '../src/lib/devtools-requests'
import type { NetworkRule } from '../src/lib/network-rules'

const capture = (body = '{"value":"captured"}'): DevtoolsRequest => ({
  startedDateTime: '2026-10-29T00:00:00.000Z', _resourceType: 'fetch',
  request: { method: 'GET', url: 'https://api.example.com/b/c/x?y=z' },
  response: { status: 200, headers: [], content: { mimeType: 'application/json' } },
  getContent: callback => callback(body, ''),
})

function storageHarness() {
  const previous = globalThis.chrome
  const session: Record<string, unknown> = {}
  const opened: string[] = []
  let rules: NetworkRule[] = []
  let writes = 0
  let activations = 0
  const failure = { staging: false, opening: false, cleanup: false, activation: false, saving: false }
  Object.assign(globalThis, { chrome: {
    storage: {
      session: {
        get: async (key: string) => ({ [key]: structuredClone(session[key]) }),
        set: async (data: Record<string, unknown>) => {
          if (failure.staging) throw new Error('Session quota exceeded')
          Object.assign(session, structuredClone(data))
        },
        remove: async (key: string) => {
          if (failure.cleanup) throw new Error('Cleanup failed')
          delete session[key]
        },
      },
      local: {
        get: async () => ({ networkRules: structuredClone(rules) }),
        set: async (data: { networkRules: NetworkRule[] }) => {
          if (failure.saving) throw new Error('Cannot save rule')
          writes++; rules = structuredClone(data.networkRules)
        },
      },
    },
    tabs: { create: async ({ url }: { url: string }) => {
      if (failure.opening) throw new Error('Cannot open tab')
      const id = new URLSearchParams(url.slice(url.indexOf('?') + 1)).get('draft')!
      assert.ok(session[`captured-network-rule:${id}`], 'the draft must be stored before opening its tab')
      opened.push(url)
    } },
    runtime: {
      getURL: (path: string) => `chrome-extension://test/${path}`,
      sendMessage: async () => { activations++; return failure.activation ? { ok: false, error: 'Activation failed' } : { ok: true, reloadTabIds: [7] } },
    },
  } })
  return { session, opened, failure, get writes() { return writes }, get rules() { return rules }, get activations() { return activations },
    restore: () => Object.assign(globalThis, { chrome: previous }) }
}

test('opening separate captured responses transfers repeatable drafts without saving or activating rules', async () => {
  const app = storageHarness()
  try {
    const [first, second] = await Promise.all([
      openCapturedNetworkRule(capture('first response'), 'https://app.example.com'),
      openCapturedNetworkRule(capture('second response'), 'https://app.example.com'),
    ])
    assert.notEqual(first, second)
    const draft = await getCapturedNetworkRuleDraft(first)
    assert.equal(draft.body, 'first response')
    assert.deepEqual(await getCapturedNetworkRuleDraft(first), draft, 'reading or reloading must not consume the draft')
    assert.equal((await getCapturedNetworkRuleDraft(second)).body, 'second response')
    assert.equal(app.writes, 0)
    assert.equal(app.activations, 0)
    assert.deepEqual(app.rules, [])
    assert.deepEqual(new Set(app.opened), new Set([first, second].map(id => `chrome-extension://test/options.html#/network-rules/new?draft=${id}`)))
    assert.ok(app.opened.every(url => !url.includes('response') && !url.includes('api.example.com')))
  } finally { app.restore() }
})

test('draft storage failures do not open an empty options tab', async () => {
  const app = storageHarness()
  try {
    app.failure.staging = true
    await assert.rejects(openCapturedNetworkRule(capture(), 'https://app.example.com'), /Session quota exceeded/)
    assert.deepEqual(app.opened, [])
    assert.equal(app.writes, 0)
  } finally { app.restore() }
})

test('failed tab creation cleans up its draft without masking the opening error', async () => {
  for (const cleanup of [false, true]) {
    const app = storageHarness()
    try {
      app.failure.opening = true
      app.failure.cleanup = cleanup
      await assert.rejects(openCapturedNetworkRule(capture(), 'https://app.example.com'), /Cannot open tab/)
      assert.equal(Object.keys(app.session).length, cleanup ? 1 : 0)
      assert.equal(app.writes, 0)
    } finally { app.restore() }
  }
})

test('missing, malformed or invalid-token drafts cannot fall back to an empty form', async () => {
  const app = storageHarness()
  try {
    await assert.rejects(getCapturedNetworkRuleDraft('invalid-token'))
    await assert.rejects(getCapturedNetworkRuleDraft(crypto.randomUUID()), /no longer available/)
    const id = await openCapturedNetworkRule(capture(), 'https://app.example.com')
    app.session[`captured-network-rule:${id}`] = { body: 'incomplete' }
    await assert.rejects(getCapturedNetworkRuleDraft(id), /no longer available/)
    assert.equal(app.writes, 0)
  } finally { app.restore() }
})

test('Save retains the draft on activation failure, retries one rule, and cleans up only after success', async () => {
  const app = storageHarness()
  try {
    const id = await openCapturedNetworkRule(capture(), 'https://app.example.com')
    const draft = await getCapturedNetworkRuleDraft(id)
    app.failure.activation = true
    await assert.rejects(saveCapturedNetworkRuleDraft(id, draft), /Activation failed/)
    assert.deepEqual(await getCapturedNetworkRuleDraft(id), draft)
    assert.equal(app.rules.length, 1)
    app.failure.activation = false
    const result = await saveCapturedNetworkRuleDraft(id, { ...draft, body: 'edited response' })
    assert.equal(result.entries.length, 1)
    assert.equal(result.entries[0].id, id)
    assert.equal(result.entries[0].body, 'edited response')
    assert.deepEqual(result.reloadTabIds, [7])
    await assert.rejects(getCapturedNetworkRuleDraft(id), /no longer available/)
  } finally { app.restore() }
})

test('session cleanup failure does not turn a successful Save into an error', async () => {
  const app = storageHarness()
  try {
    const id = await openCapturedNetworkRule(capture(), 'https://app.example.com')
    const draft = await getCapturedNetworkRuleDraft(id)
    app.failure.cleanup = true
    const result = await saveCapturedNetworkRuleDraft(id, draft)
    assert.equal(result.entries[0].id, id)
    assert.equal(app.rules.length, 1)
  } finally { app.restore() }
})

test('failed saving retains the captured draft without activating or changing rules', async () => {
  const app = storageHarness()
  try {
    const id = await openCapturedNetworkRule(capture(), 'https://app.example.com')
    const draft = await getCapturedNetworkRuleDraft(id)
    app.failure.saving = true
    await assert.rejects(saveCapturedNetworkRuleDraft(id, draft), /Cannot save rule/)
    assert.deepEqual(await getCapturedNetworkRuleDraft(id), draft)
    assert.equal(app.writes, 0)
    assert.equal(app.activations, 0)
    assert.deepEqual(app.rules, [])
  } finally { app.restore() }
})
