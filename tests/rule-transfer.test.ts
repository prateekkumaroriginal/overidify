import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyImport, exportRules, reviewImport } from '../src/lib/rule-transfer.ts'
import type { RuleCollection } from '../src/lib/rule-transfer.ts'
import { createSwitchRuleDraft } from '../src/lib/request-header-rules.ts'

const header = { id: '00000000-0000-4000-8000-000000000001', kind: 'header-rule' as const,
  name: 'Authentication', url: '*', enabled: true, order: 0, headers: [{ key: 'Authorization', value: 'Bearer exact token' }] }
const empty: RuleCollection = { requestHeaderRules: [], networkRules: [] }

test('exports round-trip complete Switch Rules and exact response bodies without dropping saved state', () => {
  const draft = createSwitchRuleDraft()
  const rules: RuleCollection = { requestHeaderRules: [header, { ...draft, kind: 'switch-rule', id: crypto.randomUUID(),
    name: 'Accounts', enabled: false, order: 1, options: draft.options.map(option => ({ ...option, headers: header.headers })) }],
  networkRules: [{ id: crypto.randomUUID(), name: 'Mock', url: '*', enabled: false, order: 0, requestUrl: 'https://api.example.com/',
    method: 'ANY', mode: 'call-server', status: 503, body: '  {not JSON\n ', headers: [{ key: 'Content-Type', value: 'application/json' }] }] }
  const review = reviewImport(exportRules(rules), empty)
  assert.deepEqual(review.issues, [])
  assert.deepEqual(applyImport(empty, review, 'add'), rules)
})

test('partial review excludes every repeated UUID and whole invalid Switch Rules', () => {
  const draft = createSwitchRuleDraft()
  const file = exportRules({ requestHeaderRules: [header, header, { ...header, id: crypto.randomUUID(), name: 'Good sibling' },
    { ...draft, id: crypto.randomUUID(), kind: 'switch-rule', order: 3, name: 'Broken selection', selectedOptionId: crypto.randomUUID() }], networkRules: [] })
  const result = reviewImport(file, empty)
  assert.equal(result.issues.length, 3)
  assert.deepEqual(result.rules.requestHeaderRules.map(rule => rule.name), ['Good sibling'])
})

test('Replace keeps existing slots while Add creates independent copies and appends in exported order', () => {
  const draft = createSwitchRuleDraft()
  const accounts = { ...draft, kind: 'switch-rule' as const, id: crypto.randomUUID(), name: 'Accounts', order: 1,
    options: draft.options.map(option => ({ ...option, headers: header.headers })) }
  const existing = { requestHeaderRules: [header, accounts], networkRules: [] }
  const incoming = { requestHeaderRules: [{ ...accounts, name: 'Updated accounts', order: 20 },
    { ...header, id: crypto.randomUUID(), name: 'First new', order: 2 }, { ...header, id: crypto.randomUUID(), name: 'Second new', order: 3 }], networkRules: [] }
  const review = reviewImport(exportRules(incoming), existing)
  assert.equal(review.overlaps.length, 1)
  const replaced = applyImport(existing, review, 'replace')
  assert.deepEqual(replaced.requestHeaderRules.map(rule => rule.name), ['Authentication', 'Updated accounts', 'First new', 'Second new'])
  const added = applyImport(existing, review, 'add')
  assert.deepEqual(added.requestHeaderRules.map(rule => rule.name), ['Authentication', 'Accounts', 'First new', 'Second new', 'Updated accounts'])
  const copy = added.requestHeaderRules[4]
  assert.equal(copy.kind, 'switch-rule')
  if (copy.kind !== 'switch-rule') throw new Error('Expected Switch Rule')
  assert.notEqual(copy.id, accounts.id)
  assert.notEqual(copy.options[0].id, accounts.options[0].id)
  assert.equal(copy.selectedOptionId, copy.options[0].id)
  assert.equal(existing.requestHeaderRules.length, 2)
})

test('rejects broken files and non-UUID identities while preserving differently identified lookalikes', () => {
  assert.throws(() => reviewImport('{', empty), /JSON/)
  assert.throws(() => reviewImport(JSON.stringify({ format: 'overidify', version: 2, ...empty }), empty), /version/)
  const invalid = reviewImport(exportRules({ requestHeaderRules: [{ ...header, id: 'old-id' }], networkRules: [] }), empty)
  assert.equal(invalid.rules.requestHeaderRules.length, 0)
  assert.equal(invalid.issues.length, 1)
  const lookalike = reviewImport(exportRules({ requestHeaderRules: [{ ...header, id: crypto.randomUUID() }], networkRules: [] }), { ...empty, requestHeaderRules: [header] })
  assert.equal(lookalike.overlaps.length, 0)
})

test('UUID letter casing cannot break the selected option or hide a duplicate rule', () => {
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const option = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const rules: RuleCollection = { requestHeaderRules: [{ ...header, kind: 'switch-rule', id, options: [
    { id: crypto.randomUUID(), name: 'First', headers: header.headers }, { id: option, name: 'Selected', headers: header.headers },
  ], selectedOptionId: option.toUpperCase() }], networkRules: [] }
  const result = reviewImport(exportRules(rules), empty)
  assert.equal(result.issues.length, 0)
  const rule = result.rules.requestHeaderRules[0]
  assert.equal(rule.kind === 'switch-rule' && rule.selectedOptionId, option)
  const duplicates = reviewImport(exportRules({ ...empty, requestHeaderRules: [{ ...header, id }, { ...header, id: id.toUpperCase() }] }), empty)
  assert.equal(duplicates.issues.length, 2)
})
