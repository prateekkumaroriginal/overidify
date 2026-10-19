import assert from 'node:assert/strict'
import { test } from 'node:test'
import { activateImportedRules, saveImportedRules } from '../src/lib/rule-transfer-storage.ts'
import type { RuleCollection } from '../src/lib/rule-transfer.ts'

test('failed saving keeps the previous setup, while failed activation can retry without another import', async () => {
  const previousChrome = globalThis.chrome
  const original: RuleCollection = { requestHeaderRules: [], networkRules: [] }
  let stored = structuredClone(original)
  let storageFailure = true
  let activationFailure = false
  const imported: RuleCollection = { requestHeaderRules: [{ id: crypto.randomUUID(), kind: 'header-rule', name: 'Imported',
    url: '*', enabled: true, order: 0, headers: [{ key: 'Authorization', value: 'secret' }] }], networkRules: [] }
  Object.assign(globalThis, { chrome: {
    storage: { local: { set: async (rules: RuleCollection) => {
      if (storageFailure) throw new Error('Storage quota exceeded')
      stored = structuredClone(rules)
    } } },
    runtime: { sendMessage: async ({ type }: { type: string }) => activationFailure && type === 'sync-network-rules'
      ? { ok: false, error: 'Activation unavailable' } : { ok: true, reloadTabIds: type === 'sync-network-rules' ? [4] : [] } },
  } })
  try {
    await assert.rejects(saveImportedRules(imported), /quota/)
    assert.deepEqual(stored, original)
    storageFailure = false; activationFailure = true
    const saved = await saveImportedRules(imported)
    assert.equal(saved.ok, false)
    assert.deepEqual(stored, imported)
    activationFailure = false
    const retried = await activateImportedRules()
    assert.equal(retried.ok, true)
    assert.deepEqual(retried.reloadTabIds, [4])
    assert.deepEqual(stored, imported)
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
