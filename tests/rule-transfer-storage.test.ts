import assert from 'node:assert/strict'
import { test } from 'node:test'
import { activateImportedRules, getSavedRules, saveImportedRules } from '../src/lib/rule-transfer-storage.ts'
import type { RuleCollection } from '../src/lib/rule-transfer.ts'
import { updateRequestHeaderRules } from '../src/lib/request-header-storage.ts'
import { updateNetworkRules } from '../src/lib/network-storage.ts'
import { createNetworkRuleDraft } from '../src/lib/network-rules.ts'

for (const kind of ['header', 'network'] as const) {
  for (const action of ['read', 'import'] as const) {
    test(`transfer ${action} waits for a ${kind} save but not its activation`, async () => {
      const previousChrome = globalThis.chrome
      const stored: RuleCollection = {
        requestHeaderRules: [{ id: crypto.randomUUID(), kind: 'header-rule', name: 'Headers', url: '*', enabled: true,
          order: 0, headers: [{ key: 'X-Test', value: 'saved' }] }],
        networkRules: [{ ...createNetworkRuleDraft(), id: crypto.randomUUID(), name: 'Network', requestUrl: 'https://example.com/api', order: 0 }],
      }
      const writeStarted = Promise.withResolvers<void>()
      const write = Promise.withResolvers<void>()
      const activationStarted = Promise.withResolvers<void>()
      const activation = Promise.withResolvers<void>()
      let snapshot: RuleCollection | undefined
      let writes = 0
      Object.assign(globalThis, { chrome: {
        storage: { local: {
          get: async (key: keyof RuleCollection) => ({ [key]: structuredClone(stored[key]) }),
          set: async (rules: Partial<RuleCollection>) => {
            if (++writes === 1) {
              writeStarted.resolve()
              await write.promise
            }
            Object.assign(stored, structuredClone(rules))
            if ('requestHeaderRules' in rules && 'networkRules' in rules) snapshot = structuredClone(stored)
          },
        } },
        runtime: { sendMessage: async () => {
          activationStarted.resolve()
          await activation.promise
          return { ok: true }
        } },
      } })
      let saving: Promise<unknown> | undefined
      let transferring: Promise<unknown> | undefined
      try {
        saving = kind === 'header'
          ? updateRequestHeaderRules(rules => rules.map(rule => ({ ...rule, enabled: false })))
          : updateNetworkRules(rules => rules.map(rule => ({ ...rule, enabled: false })))
        await writeStarted.promise
        transferring = action === 'read'
          ? getSavedRules().then(rules => { snapshot = rules })
          : saveImportedRules({ requestHeaderRules: stored.requestHeaderRules.map(rule => ({ ...rule, enabled: false })),
            networkRules: stored.networkRules.map(rule => ({ ...rule, enabled: false })) })
        await new Promise(resolve => setImmediate(resolve))
        assert.equal(snapshot, undefined, 'must not transfer the setup before the write finishes')
        write.resolve()
        await activationStarted.promise
        await new Promise(resolve => setImmediate(resolve))
        assert.ok(snapshot, 'transfer must proceed before activation finishes')
        assert.equal((kind === 'header' ? snapshot.requestHeaderRules : snapshot.networkRules)[0].enabled, false)
      } finally {
        write.resolve(); activation.resolve()
        await Promise.allSettled([saving, transferring])
        Object.assign(globalThis, { chrome: previousChrome })
      }
    })
  }
}

test('failed saving keeps the previous setup, while failed activation can retry without another import', async () => {
  const previousChrome = globalThis.chrome
  const original: RuleCollection = { requestHeaderRules: [], networkRules: [] }
  let stored = structuredClone(original)
  let storageFailure = true
  let activationFailure = false
  let writes = 0
  let activationCalls = 0
  const imported: RuleCollection = { requestHeaderRules: [{ id: crypto.randomUUID(), kind: 'header-rule', name: 'Imported',
    url: '*', enabled: true, order: 0, headers: [{ key: 'Authorization', value: 'secret' }] }], networkRules: [] }
  Object.assign(globalThis, { chrome: {
    storage: { local: { set: async (rules: RuleCollection) => {
      writes++
      if (storageFailure) throw new Error('Storage quota exceeded')
      stored = structuredClone(rules)
    } } },
    runtime: { sendMessage: async ({ type }: { type: string }) => {
      activationCalls++
      return activationFailure && type === 'sync-network-rules'
        ? { ok: false, error: 'Activation unavailable' } : { ok: true, reloadTabIds: type === 'sync-network-rules' ? [4] : [] }
    } },
  } })
  try {
    await assert.rejects(saveImportedRules(imported), /quota/)
    assert.deepEqual(stored, original)
    assert.equal(activationCalls, 0)
    storageFailure = false; activationFailure = true
    const saved = await saveImportedRules(imported)
    assert.equal(saved.ok, false)
    assert.deepEqual(stored, imported)
    assert.equal(writes, 2)
    assert.equal(activationCalls, 2)
    activationFailure = false
    const retried = await activateImportedRules()
    assert.equal(retried.ok, true)
    assert.deepEqual(retried.reloadTabIds, [4])
    assert.deepEqual(stored, imported)
    assert.equal(writes, 2)
    assert.equal(activationCalls, 4)
  } finally { Object.assign(globalThis, { chrome: previousChrome }) }
})

test('a synchronous activation error is reported as saved rather than encouraging another import', async () => {
  const previousChrome = globalThis.chrome
  let stored: RuleCollection | undefined
  const imported: RuleCollection = { requestHeaderRules: [], networkRules: [] }
  Object.assign(globalThis, { chrome: { storage: { local: { set: async (rules: RuleCollection) => { stored = rules } } },
    runtime: { sendMessage: () => { throw new Error('Extension context invalidated') } } } })
  try {
    const result = await saveImportedRules(imported)
    assert.equal(result.ok, false)
    assert.deepEqual(stored, imported)
  } finally { Object.assign(globalThis, { chrome: previousChrome }) }
})
