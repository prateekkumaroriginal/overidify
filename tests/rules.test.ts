import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createRuleDraft,
  createSwitcherDraft,
  getEntryHeaders,
  getSelectedOption,
  normalizeEntries,
  ruleToDraft,
  switcherToDraft,
} from '../src/lib/rules.ts'

const legacy = {
  id: 'old-rule', name: 'Authentication', url: '*://api.example.com/*',
  enabled: false, order: 5, headers: [{ key: 'Authorization', value: 'Bearer original' }],
}
const options = [
  { id: 'admin', name: 'Admin', headers: [{ key: 'Authorization', value: 'admin' }] },
  { id: 'guest', name: 'Guest', headers: [{ key: 'X-Role', value: 'guest' }] },
]

test('original rules retain their direct headers, identity, matching, and enabled state', () => {
  const [rule] = normalizeEntries([legacy])
  assert.equal(rule.kind, 'rule')
  assert.equal(rule.id, legacy.id)
  assert.equal(rule.url, legacy.url)
  assert.equal(rule.enabled, false)
  assert.deepEqual(getEntryHeaders(rule), legacy.headers)
  assert.equal('options' in rule, false)
  assert.deepEqual(normalizeEntries(JSON.parse(JSON.stringify([rule]))), [rule])
})

test('the prior Default-option migration is restored to an ordinary rule without losing headers', () => {
  const [rule] = normalizeEntries([{ ...legacy, headers: undefined, options: [
    { id: 'default', name: 'Default', headers: legacy.headers },
  ], selectedOptionId: 'default' }])
  assert.equal(rule.kind, 'rule')
  assert.deepEqual(getEntryHeaders(rule), legacy.headers)
  assert.equal('selectedOptionId' in rule, false)
})

test('previous multi-option items become switchers and retain their selected option', () => {
  const [switcher] = normalizeEntries([{ ...legacy, options, selectedOptionId: 'guest' }])
  assert.equal(switcher.kind, 'switcher')
  if (switcher.kind !== 'switcher') throw new Error('Expected switcher')
  assert.equal(switcher.selectedOptionId, 'guest')
  assert.deepEqual(getEntryHeaders(switcher), options[1].headers)
  assert.deepEqual(normalizeEntries([switcher]), [switcher])
})

test('explicit switchers keep their type when one Default option remains', () => {
  const [switcher] = normalizeEntries([{ ...legacy, kind: 'switcher', options: [
    { id: 'default', name: 'Default', headers: legacy.headers },
  ], selectedOptionId: 'default' }])
  assert.equal(switcher.kind, 'switcher')
  assert.deepEqual(getEntryHeaders(switcher), legacy.headers)
})

test('switching a switcher replaces its header set while preserving ordinary rules and priority order', () => {
  const entries = normalizeEntries([
    { ...legacy, kind: 'switcher', order: 6, options, selectedOptionId: 'admin' },
    { ...legacy, id: 'regular', order: 4 },
  ])
  assert.deepEqual(entries.map((entry) => [entry.id, entry.order]), [['regular', 0], ['old-rule', 1]])
  const switcher = entries[1]
  if (switcher.kind !== 'switcher') throw new Error('Expected switcher')
  const switched = { ...switcher, selectedOptionId: 'guest' }
  assert.deepEqual(getEntryHeaders(switched), [{ key: 'X-Role', value: 'guest' }])
  assert.deepEqual(getEntryHeaders(switcher), [{ key: 'Authorization', value: 'admin' }])
  assert.deepEqual(getEntryHeaders(entries[0]), legacy.headers)
})

test('deleting the selected option falls back to an existing option without changing switcher type', () => {
  const [entry] = normalizeEntries([{ ...legacy, kind: 'switcher', options: [options[0]], selectedOptionId: 'guest' }])
  if (entry.kind !== 'switcher') throw new Error('Expected switcher')
  assert.equal(entry.selectedOptionId, 'admin')
  assert.deepEqual(getSelectedOption(entry).headers, options[0].headers)
})

test('normalization supplies unique option IDs and preserves all valid header sets', () => {
  const [entry] = normalizeEntries([{ ...legacy, kind: 'switcher', options: [
    { id: 'same', name: ' A ', headers: [{ key: ' X-A ', value: ' a ' }] },
    { id: 'same', name: 'B', headers: [{ key: 'X-B', value: 'b' }] },
    { name: 'C', headers: [{ key: 'X-C', value: 'c' }, null] },
  ] }])
  if (entry.kind !== 'switcher') throw new Error('Expected switcher')
  assert.equal(new Set(entry.options.map((option) => option.id)).size, 3)
  assert.deepEqual(entry.options.map((option) => option.headers), [
    [{ key: 'X-A', value: 'a' }], [{ key: 'X-B', value: 'b' }], [{ key: 'X-C', value: 'c' }],
  ])
})

test('rule and switcher drafts do not mutate stored header data', () => {
  const [rule, switcher] = normalizeEntries([legacy, { ...legacy, id: 'switcher', kind: 'switcher', options }])
  if (rule.kind !== 'rule' || switcher.kind !== 'switcher') throw new Error('Expected both types')
  const ruleDraft = ruleToDraft(rule)
  const switcherDraft = switcherToDraft(switcher)
  ruleDraft.headers[0].value = 'changed'
  switcherDraft.options[0].headers[0].value = 'changed'
  assert.equal(rule.headers[0].value, 'Bearer original')
  assert.equal(switcher.options[0].headers[0].value, 'admin')
})

test('new drafts have distinct shapes and empty switchers always have an option', () => {
  const rule = createRuleDraft()
  const switcher = createSwitcherDraft()
  assert.equal('options' in rule, false)
  assert.deepEqual(rule.headers, [{ key: '', value: '' }])
  assert.equal(getSelectedOption(switcher).id, switcher.selectedOptionId)
  const [entry] = normalizeEntries([{ ...legacy, kind: 'switcher', headers: [], options: [] }])
  if (entry.kind !== 'switcher') throw new Error('Expected switcher')
  assert.equal(getEntryHeaders(entry).length, 0)
})
