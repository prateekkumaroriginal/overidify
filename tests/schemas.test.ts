import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HeaderRuleDraftSchema, SwitchRuleDraftSchema } from '../src/lib/request-header-schemas.ts'
import { NetworkRuleDraftSchema } from '../src/lib/network-schemas.ts'
import { createHeaderRuleDraft, createSwitchRuleDraft } from '../src/lib/request-header-rules.ts'
import { createNetworkRuleDraft, normalizeNetworkRules } from '../src/lib/network-rules.ts'
import { NetworkBridgeMessageSchema, NetworkPageMessageSchema, NetworkRuntimeMessageSchema, NetworkSettingsResponseSchema, ActivationResultSchema } from '../src/lib/settings-messages.ts'

test('draft schemas preserve response text and distinguish request and response header validation', () => {
  const draft = { ...createNetworkRuleDraft(), id: '00000000-0000-4000-8000-000000000099', name: 'Mock', requestUrl: 'http://localhost:4200/api', body: '  {broken json\n ' }
  assert.equal(NetworkRuleDraftSchema.parse(draft).body, draft.body)
  assert.equal(NetworkRuleDraftSchema.safeParse({ ...draft, headers: [{ key: 'X-Empty', value: '' }] }).success, true)
  assert.equal(HeaderRuleDraftSchema.safeParse({ ...createHeaderRuleDraft(), name: 'Rule', headers: [{ key: 'X-Empty', value: '' }] }).success, false)
  assert.equal(HeaderRuleDraftSchema.safeParse({ ...createHeaderRuleDraft(), name: 'Rule', headers: [{ key: '', value: '' }, { key: 'X-Valid', value: 'ok' }] }).success, true)
})

test('Switch Rule schema identifies duplicate option names by field path', () => {
  const draft = createSwitchRuleDraft()
  draft.name = 'Accounts'
  draft.options = [
    { id: '00000000-0000-4000-8000-000000000001', name: 'Admin', headers: [{ key: 'X-Role', value: 'a' }] },
    { id: '00000000-0000-4000-8000-000000000006', name: ' ADMIN ', headers: [{ key: 'X-Role', value: 'b' }] },
  ]
  const parsed = SwitchRuleDraftSchema.safeParse(draft)
  assert.equal(parsed.success, false)
  if (!parsed.success) assert.deepEqual(parsed.error.issues[0].path, ['options', 1, 'name'])
})

test('persisted invalid Network Rules stay editable and disabled without losing valid siblings or raw bodies', () => {
  const draft = { ...createNetworkRuleDraft(), id: '00000000-0000-4000-8000-000000000099', name: 'Mock', requestUrl: 'http://localhost/api', body: ' {broken\n' }
  const entries = normalizeNetworkRules([{ ...draft, id: '00000000-0000-4000-8000-00000000000e', status: 600 }, { ...draft, id: '00000000-0000-4000-8000-000000000019', order: 0 }])
  assert.deepEqual(entries.map(entry => entry.id), ['00000000-0000-4000-8000-00000000000e', '00000000-0000-4000-8000-000000000019'])
  assert.equal(entries[0].enabled, false)
  assert.equal(entries[0].status, 600)
  assert.equal(entries[0].body, draft.body)
  assert.equal(entries[1].enabled, true)
  const corrupted = normalizeNetworkRules([{ ...draft, status: NaN }, { ...draft, status: Infinity }, ...entries])
  assert.equal(corrupted[0].enabled, false)
  assert.equal(corrupted[1].enabled, false)
  assert.equal(NetworkSettingsResponseSchema.safeParse({ entries: corrupted }).success, true)
})

test('settings protocols reject malformed payloads instead of trusting TypeScript casts', () => {
  assert.equal(NetworkPageMessageSchema.safeParse({ source: 'overidify-network-page', type: 'applied', id: 1, needsReload: 'false' }).success, false)
  assert.equal(NetworkBridgeMessageSchema.safeParse({ source: 'other', type: 'hello' }).success, false)
  assert.equal(NetworkRuntimeMessageSchema.safeParse({ type: 'update-network-rules', entries: [{ status: 200 }] }).success, false)
  assert.equal(ActivationResultSchema.safeParse({ ok: true, reloadTabIds: ['1'] }).success, false)
  assert.equal(ActivationResultSchema.safeParse({ ok: true, reloadTabIds: [1] }).success, true)
})
