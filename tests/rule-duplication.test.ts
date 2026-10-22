import assert from 'node:assert/strict'
import { test } from 'node:test'
import { activateImportedRules, duplicateSavedRule } from '../src/lib/rule-transfer-storage.ts'
import { updateRequestHeaderRules } from '../src/lib/request-header-storage.ts'
import { createNetworkRuleDraft } from '../src/lib/network-rules.ts'
import type { RuleCollection, TransferRule } from '../src/lib/rule-transfer.ts'

function setup() {
  const options = ['Personal', 'Team'].map(name => ({ id: crypto.randomUUID(), name, headers: [{ key: 'Authorization', value: `Bearer ${name}` }] }))
  const original: RuleCollection = {
    requestHeaderRules: [
      { id: crypto.randomUUID(), kind: 'header-rule', name: 'Staging', url: 'app.example.com', enabled: true,
        order: 0, headers: [{ key: 'X-Account', value: 'original' }] },
      { id: crypto.randomUUID(), kind: 'switch-rule', name: 'Accounts', url: '*', enabled: false,
        order: 1, options, selectedOptionId: options[1].id },
      { id: crypto.randomUUID(), kind: 'header-rule', name: 'Later header', url: '*', enabled: true, order: 2, headers: [] },
    ],
    networkRules: ['Response', 'Later response'].map((name, order) => ({ ...createNetworkRuleDraft(), id: crypto.randomUUID(), name,
      requestUrl: 'https://api.example.com/resource?x=1', order, status: 201, mode: 'call-server' as const,
      body: '{\n  "saved": true\n}', headers: [{ key: 'Content-Type', value: 'application/json' }] })),
  }
  const state = { stored: structuredClone(original), writes: 0, messages: [] as string[], failSave: false, failActivation: false }
  const previousChrome = globalThis.chrome
  const local = {
    get: async (key: keyof RuleCollection) => ({ [key]: structuredClone(state.stored[key]) }),
    set: async (rules: Partial<RuleCollection>) => {
      if (state.failSave) throw new Error('Storage unavailable')
      state.writes++
      Object.assign(state.stored, structuredClone(rules))
    },
  }
  Object.assign(globalThis, { chrome: { storage: { local }, runtime: { sendMessage: async ({ type }: { type: string }) => {
    state.messages.push(type)
    return state.failActivation ? { ok: false, error: 'Activation unavailable' } : { ok: true, reloadTabIds: type === 'sync-network-rules' ? [7] : [] }
  } } } })
  return { original, state, local, restore: () => { Object.assign(globalThis, { chrome: previousChrome }) } }
}

for (const kind of ['header', 'switch', 'network'] as const) {
  test(`${kind} duplication saves an independent disabled copy immediately after the source`, async () => {
    const { original, state, restore } = setup()
    try {
      const source = kind === 'network' ? original.networkRules[0] : original.requestHeaderRules[kind === 'switch' ? 1 : 0]
      const result = await duplicateSavedRule(source.id)
      const copy = result.copy
      assert.notEqual(copy.id, source.id)
      assert.equal(copy.name, `${source.name} (copy)`)
      assert.equal(copy.enabled, false)
      assert.equal(copy.order, source.order + 1)
      const collection: TransferRule[] = kind === 'network' ? state.stored.networkRules : state.stored.requestHeaderRules
      assert.equal(collection[source.order + 1].id, copy.id)
      assert.deepEqual(collection.map(rule => rule.order), collection.map((_, index) => index))
      const expected = { ...source, id: copy.id, name: copy.name, enabled: false, order: copy.order }
      if ('kind' in source && source.kind === 'switch-rule' && 'kind' in copy && copy.kind === 'switch-rule') {
        assert.deepEqual(copy.options.map(({ name, headers }) => ({ name, headers })), source.options.map(({ name, headers }) => ({ name, headers })))
        const originalIds = new Set(source.options.map(option => option.id))
        assert.ok(copy.options.every(option => !originalIds.has(option.id)))
        assert.equal(new Set(copy.options.map(option => option.id)).size, copy.options.length)
        assert.equal(copy.selectedOptionId, copy.options[1].id)
        assert.deepEqual({ ...copy, options: source.options, selectedOptionId: source.selectedOptionId }, expected)
      } else assert.deepEqual(copy, expected)
      assert.deepEqual(collection[source.order], source)
      assert.deepEqual(kind === 'network' ? state.stored.requestHeaderRules : state.stored.networkRules,
        kind === 'network' ? original.requestHeaderRules : original.networkRules)
      assert.equal(state.writes, 1)
      assert.equal(result.activation.ok, true)
      assert.deepEqual(result.activation.reloadTabIds, [7])
    } finally { restore() }
  })
}

test('copy names avoid case-insensitive collisions across types and keep a copy in its name family', async () => {
  const { state, restore } = setup()
  try {
    state.stored.networkRules[0].name = 'STAGING (COPY)'
    state.stored.networkRules[1].name = 'Staging (copy 3)'
    const first = await duplicateSavedRule(state.stored.requestHeaderRules[0].id)
    assert.equal(first.copy.name, 'Staging (copy 2)')
    const second = await duplicateSavedRule(first.copy.id)
    assert.equal(second.copy.name, 'Staging (copy 4)')
    assert.notEqual(first.copy.id, second.copy.id)
    assert.deepEqual(state.stored.requestHeaderRules.slice(0, 3).map(rule => rule.name), ['Staging', 'Staging (copy 2)', 'Staging (copy 4)'])
  } finally { restore() }
})

test('an unnamed saved rule gets a useful copy name', async () => {
  const { state, restore } = setup()
  try {
    state.stored.requestHeaderRules[0].name = ''
    assert.equal((await duplicateSavedRule(state.stored.requestHeaderRules[0].id)).copy.name, 'Untitled rule (copy)')
  } finally { restore() }
})

test('a missing source or failed save creates no copy and does not activate', async () => {
  const { original, state, restore } = setup()
  try {
    await assert.rejects(duplicateSavedRule(crypto.randomUUID()), /no longer exists/)
    state.failSave = true
    await assert.rejects(duplicateSavedRule(original.requestHeaderRules[0].id), /Storage unavailable/)
    assert.deepEqual(state.stored, original)
    assert.equal(state.writes, 0)
    assert.deepEqual(state.messages, [])
  } finally { restore() }
})

test('a saved copy survives activation failure and activation retry never makes another copy', async () => {
  const { original, state, restore } = setup()
  try {
    state.failActivation = true
    const result = await duplicateSavedRule(original.requestHeaderRules[1].id)
    assert.equal(result.activation.ok, false)
    assert.match(result.activation.error!, /Activation unavailable/)
    assert.equal(state.stored.requestHeaderRules.filter(rule => rule.id === result.copy.id).length, 1)
    state.failActivation = false
    assert.equal((await activateImportedRules()).ok, true)
    assert.equal(state.writes, 1)
    assert.equal(state.stored.requestHeaderRules.length, original.requestHeaderRules.length + 1)
  } finally { restore() }
})

test('concurrent copies serialize naming and preserve both copies', async () => {
  const { original, state, restore } = setup()
  try {
    const results = await Promise.all([duplicateSavedRule(original.requestHeaderRules[0].id), duplicateSavedRule(original.requestHeaderRules[0].id)])
    assert.deepEqual(results.map(result => result.copy.name).sort(), ['Staging (copy 2)', 'Staging (copy)'].sort())
    assert.equal(new Set(results.map(result => result.copy.id)).size, 2)
    assert.equal(state.stored.requestHeaderRules.length, original.requestHeaderRules.length + 2)
  } finally { restore() }
})

test('duplication waits for a pending source save and copies its latest values without losing unrelated edits', async () => {
  const { original, state, local, restore } = setup()
  const started = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const set = local.set
  local.set = async rules => { started.resolve(); await release.promise; await set(rules) }
  let saving: Promise<unknown> | undefined
  let copying: ReturnType<typeof duplicateSavedRule> | undefined
  try {
    saving = updateRequestHeaderRules(rules => rules.map(rule => ({ ...rule, name: `${rule.name} updated` })))
    await started.promise
    copying = duplicateSavedRule(original.requestHeaderRules[0].id)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(state.writes, 0)
    release.resolve()
    await saving
    const result = await copying
    assert.equal(result.copy.name, 'Staging updated (copy)')
    assert.equal(state.stored.requestHeaderRules.at(-1)!.name, 'Later header updated')
    assert.deepEqual(state.stored.networkRules, original.networkRules)
  } finally {
    release.resolve()
    await Promise.allSettled([saving, copying])
    restore()
  }
})
