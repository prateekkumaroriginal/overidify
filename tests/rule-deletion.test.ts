import assert from 'node:assert/strict'
import { test } from 'node:test'
import { activateImportedRules, deleteSavedRules, persistRuleDeletion } from '../src/lib/rule-transfer-storage.ts'
import { createNetworkRuleDraft } from '../src/lib/network-rules.ts'
import type { RuleCollection } from '../src/lib/rule-transfer.ts'

function setup() {
  const optionId = crypto.randomUUID()
  const original: RuleCollection = {
    requestHeaderRules: [
      { id: crypto.randomUUID(), kind: 'header-rule', name: 'Delete header', url: '*', enabled: true,
        order: 0, headers: [{ key: 'Authorization', value: 'secret' }] },
      { id: crypto.randomUUID(), kind: 'switch-rule', name: 'Delete switch', url: '*', enabled: false,
        order: 1, options: [{ id: optionId, name: 'Account', headers: [] }], selectedOptionId: optionId },
      { id: crypto.randomUUID(), kind: 'header-rule', name: 'Keep header', url: '*', enabled: false,
        order: 2, headers: [{ key: 'X-Keep', value: 'unchanged' }] },
    ],
    networkRules: ['Delete network', 'Keep network'].map((name, order) => ({
      ...createNetworkRuleDraft(), id: crypto.randomUUID(), name, requestUrl: 'https://example.com/api', order,
    })),
  }
  const state = { stored: structuredClone(original), writes: 0, messages: [] as string[], storageFailure: false, activationFailure: false }
  const previousChrome = globalThis.chrome
  Object.assign(globalThis, { chrome: {
    storage: { local: {
      get: async (key: keyof RuleCollection) => ({ [key]: structuredClone(state.stored[key]) }),
      set: async (rules: Partial<RuleCollection>) => {
        if (state.storageFailure) throw new Error('Storage unavailable')
        state.writes++
        Object.assign(state.stored, structuredClone(rules))
      },
    } },
    runtime: { sendMessage: async ({ type }: { type: string }) => {
      state.messages.push(type)
      return state.activationFailure && type === 'sync-network-rules'
        ? { ok: false, error: 'Network activation unavailable' }
        : { ok: true, reloadTabIds: type === 'sync-network-rules' ? [7] : [] }
    } },
  } })
  return { original, state, restore: () => { Object.assign(globalThis, { chrome: previousChrome }) } }
}

test('selection deletion removes all three rule types in one save and preserves unselected rules', async () => {
  const { original, state, restore } = setup()
  try {
    const result = await deleteSavedRules(new Set([
      original.requestHeaderRules[0].id, original.requestHeaderRules[1].id, original.networkRules[0].id,
    ]))
    assert.equal(result.deletedCount, 3)
    assert.deepEqual(result.rules, {
      requestHeaderRules: [original.requestHeaderRules[2]], networkRules: [original.networkRules[1]],
    })
    assert.deepEqual(state.stored, result.rules)
    assert.equal(state.writes, 1)
    assert.deepEqual(state.messages.sort(), ['sync-network-rules', 'sync-request-header-rules'])
    assert.deepEqual(result.activation, { ok: true, reloadTabIds: [7], error: undefined })
  } finally { restore() }
})

test('deleting every selected rule can leave both collections empty', async () => {
  const { original, state, restore } = setup()
  try {
    const result = await deleteSavedRules(new Set([...original.requestHeaderRules, ...original.networkRules].map(rule => rule.id)))
    assert.equal(result.deletedCount, 5)
    assert.deepEqual(state.stored, { requestHeaderRules: [], networkRules: [] })
  } finally { restore() }
})

test('empty or stale selections do not write or activate rules', async () => {
  const { original, state, restore } = setup()
  try {
    for (const ids of [new Set<string>(), new Set([crypto.randomUUID()])]) {
      const result = await deleteSavedRules(ids)
      assert.equal(result.deletedCount, 0)
      assert.equal(result.activation.ok, true)
      assert.deepEqual(result.rules, original)
    }
    assert.equal(state.writes, 0)
    assert.deepEqual(state.messages, [])
  } finally { restore() }
})

test('failed deletion preserves storage and does not attempt activation', async () => {
  const { original, state, restore } = setup()
  try {
    state.storageFailure = true
    const ids = new Set([original.requestHeaderRules[0].id, original.networkRules[0].id])
    await assert.rejects(deleteSavedRules(ids), /Storage unavailable/)
    assert.deepEqual(state.stored, original)
    assert.deepEqual(state.messages, [])
    state.storageFailure = false
    assert.equal((await deleteSavedRules(ids)).deletedCount, 2)
  } finally { restore() }
})

test('activation failure reports the saved deletion and can retry without another deletion', async () => {
  const { original, state, restore } = setup()
  try {
    state.activationFailure = true
    const result = await deleteSavedRules(new Set([original.networkRules[0].id]))
    assert.equal(result.deletedCount, 1)
    assert.equal(result.activation.ok, false)
    assert.match(result.activation.error!, /Network activation unavailable/)
    assert.deepEqual(state.stored.networkRules, [original.networkRules[1]])
    state.activationFailure = false
    assert.equal((await activateImportedRules()).ok, true)
    assert.equal(state.writes, 1)
  } finally { restore() }
})

test('saving a deletion completes independently of activation', async () => {
  const { original, state, restore } = setup()
  try {
    const result = await persistRuleDeletion(new Set([original.requestHeaderRules[0].id]))
    assert.equal(result.deletedCount, 1)
    assert.equal(state.stored.requestHeaderRules.some(rule => rule.id === original.requestHeaderRules[0].id), false)
    assert.deepEqual(result.rules, state.stored)
    assert.equal(state.writes, 1)
    assert.deepEqual(state.messages, [], 'the caller can close its confirmation before starting activation')
    assert.equal((await activateImportedRules()).ok, true)
    assert.equal(state.writes, 1)
  } finally { restore() }
})

test('deletion reads the latest saved rules and snapshots the requested selection before waiting', async () => {
  const { original, state, restore } = setup()
  const started = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  let saving: Promise<unknown> | undefined
  let deleting: Promise<unknown> | undefined
  try {
    saving = navigator.locks.request('requestHeaderRules', async () => {
      started.resolve()
      await release.promise
      state.stored.requestHeaderRules[2].name = 'Latest edit'
    })
    await started.promise
    const ids = new Set([original.requestHeaderRules[0].id])
    deleting = deleteSavedRules(ids)
    ids.clear()
    release.resolve()
    await Promise.all([saving, deleting])
    assert.deepEqual(state.stored.requestHeaderRules.map(rule => rule.name), ['Delete switch', 'Latest edit'])
  } finally {
    release.resolve()
    await Promise.allSettled([saving, deleting])
    restore()
  }
})
