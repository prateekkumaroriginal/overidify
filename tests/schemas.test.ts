import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RuleDraftSchema, SwitcherDraftSchema } from '../src/lib/header-schemas.ts'
import { NetworkOverrideDraftSchema } from '../src/lib/network-schemas.ts'
import { createRuleDraft, createSwitcherDraft } from '../src/lib/rules.ts'
import { createNetworkOverrideDraft, normalizeNetworkOverrides } from '../src/lib/network-rules.ts'
import { NetworkBridgeMessageSchema, NetworkPageMessageSchema, NetworkRuntimeMessageSchema, NetworkSettingsResponseSchema, ActivationResultSchema } from '../src/lib/settings-messages.ts'

test('draft schemas preserve response text and distinguish request and response header validation', () => {
  const draft = { ...createNetworkOverrideDraft(), name: 'Mock', requestUrl: 'http://localhost:4200/api', body: '  {broken json\n ' }
  assert.equal(NetworkOverrideDraftSchema.parse(draft).body, draft.body)
  assert.equal(NetworkOverrideDraftSchema.safeParse({ ...draft, headers: [{ key: 'X-Empty', value: '' }] }).success, true)
  assert.equal(RuleDraftSchema.safeParse({ ...createRuleDraft(), name: 'Rule', headers: [{ key: 'X-Empty', value: '' }] }).success, false)
  assert.equal(RuleDraftSchema.safeParse({ ...createRuleDraft(), name: 'Rule', headers: [{ key: '', value: '' }, { key: 'X-Valid', value: 'ok' }] }).success, true)
})

test('switcher schema identifies duplicate option names by field path', () => {
  const draft = createSwitcherDraft()
  draft.name = 'Accounts'
  draft.options = [
    { id: 'a', name: 'Admin', headers: [{ key: 'X-Role', value: 'a' }] },
    { id: 'b', name: ' ADMIN ', headers: [{ key: 'X-Role', value: 'b' }] },
  ]
  const parsed = SwitcherDraftSchema.safeParse(draft)
  assert.equal(parsed.success, false)
  if (!parsed.success) assert.deepEqual(parsed.error.issues[0].path, ['options', 1, 'name'])
})

test('persisted invalid overrides stay editable and disabled without losing valid siblings or raw bodies', () => {
  const draft = { ...createNetworkOverrideDraft(), name: 'Mock', requestUrl: 'http://localhost/api', body: ' {broken\n' }
  const entries = normalizeNetworkOverrides([{ ...draft, id: 'invalid', status: 600 }, { ...draft, id: 'valid', order: 0 }])
  assert.deepEqual(entries.map(entry => entry.id), ['invalid', 'valid'])
  assert.equal(entries[0].enabled, false)
  assert.equal(entries[0].status, 600)
  assert.equal(entries[0].body, draft.body)
  assert.equal(entries[1].enabled, true)
  const corrupted = normalizeNetworkOverrides([{ ...draft, status: NaN }, { ...draft, status: Infinity }, ...entries])
  assert.equal(corrupted[0].enabled, false)
  assert.equal(corrupted[1].enabled, false)
  assert.equal(NetworkSettingsResponseSchema.safeParse({ entries: corrupted }).success, true)
})

test('settings protocols reject malformed payloads instead of trusting TypeScript casts', () => {
  assert.equal(NetworkPageMessageSchema.safeParse({ source: 'overidify-network-page', type: 'applied', id: 1, needsReload: 'false' }).success, false)
  assert.equal(NetworkBridgeMessageSchema.safeParse({ source: 'other', type: 'hello' }).success, false)
  assert.equal(NetworkRuntimeMessageSchema.safeParse({ type: 'update-network-overrides', entries: [{ status: 200 }] }).success, false)
  assert.equal(ActivationResultSchema.safeParse({ ok: true, reloadTabIds: ['1'] }).success, false)
  assert.equal(ActivationResultSchema.safeParse({ ok: true, reloadTabIds: [1] }).success, true)
})
