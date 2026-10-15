import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createHeaderRuleDraft,
  createSwitchRuleDraft,
  getEntryHeaders,
  getSelectedOption,
  normalizeRequestHeaderRules,
  headerRuleToDraft,
  switchRuleToDraft,
} from '../src/lib/request-header-rules.ts'

const headerRule = {
  kind: 'header-rule',
  id: 'authentication', name: 'Authentication', url: '*://api.example.com/*',
  enabled: false, order: 5, headers: [{ key: 'Authorization', value: 'Bearer original' }],
}
const options = [
  { id: 'admin', name: 'Admin', headers: [{ key: 'Authorization', value: 'admin' }] },
  { id: 'guest', name: 'Guest', headers: [{ key: 'X-Role', value: 'guest' }] },
]

test('Header Rules normalize their domains and retain their direct headers, identity, and enabled state', () => {
  const [rule] = normalizeRequestHeaderRules([headerRule])
  assert.equal(rule.kind, 'header-rule')
  assert.equal(rule.id, headerRule.id)
  assert.equal(rule.url, 'api.example.com')
  assert.equal(rule.enabled, false)
  assert.deepEqual(getEntryHeaders(rule), headerRule.headers)
  assert.equal('options' in rule, false)
  assert.deepEqual(normalizeRequestHeaderRules(JSON.parse(JSON.stringify([rule]))), [rule])
})

test('entries require an explicit supported kind and malformed siblings do not hide valid entries', () => {
  assert.deepEqual(normalizeRequestHeaderRules([null, {}, { ...headerRule, kind: 'unknown' }, headerRule]), normalizeRequestHeaderRules([headerRule]))
})

test('Switch Rules retain their selected option and header sets', () => {
  const [switchRule] = normalizeRequestHeaderRules([{ ...headerRule, kind: 'switch-rule', options, selectedOptionId: 'guest' }])
  assert.equal(switchRule.kind, 'switch-rule')
  if (switchRule.kind !== 'switch-rule') throw new Error('Expected Switch Rule')
  assert.equal(switchRule.selectedOptionId, 'guest')
  assert.deepEqual(getEntryHeaders(switchRule), options[1].headers)
  assert.deepEqual(normalizeRequestHeaderRules([switchRule]), [switchRule])
})

test('Switch Rules keep their type with a single option', () => {
  const [switchRule] = normalizeRequestHeaderRules([{ ...headerRule, kind: 'switch-rule', options: [
    { id: 'default', name: 'Only option', headers: headerRule.headers },
  ], selectedOptionId: 'default' }])
  assert.equal(switchRule.kind, 'switch-rule')
  assert.deepEqual(getEntryHeaders(switchRule), headerRule.headers)
})

test('Switch Rules normalize full URLs to domains without changing headers or selection', () => {
  const [entry] = normalizeRequestHeaderRules([{ ...headerRule, kind: 'switch-rule', url: 'http://localhost:4200/messages', options, selectedOptionId: 'guest' }])
  if (entry.kind !== 'switch-rule') throw new Error('Expected Switch Rule')
  assert.equal(entry.url, 'localhost:4200')
  assert.equal(entry.selectedOptionId, 'guest')
  assert.deepEqual(entry.options, options)
  assert.deepEqual(normalizeRequestHeaderRules([entry]), [entry])
})

test('Header Rules and Switch Rules normalize the same patterns to identical domains', () => {
  for (const [input, domain] of [
    ['http://localhost:4200/messages', 'localhost:4200'],
    [' https://API.EXAMPLE.COM/path?query=1#tab ', 'api.example.com'],
    ['*://*.example.com/*', '*.example.com'],
    ['*', '*'],
    ['http://[::1]:4200/messages', '[::1]:4200'],
  ]) {
    const entries = normalizeRequestHeaderRules([
      { ...headerRule, kind: 'header-rule', url: input },
      { ...headerRule, id: 'switch-rule', kind: 'switch-rule', url: input, options },
    ])
    assert.deepEqual(entries.map((entry) => entry.url), [domain, domain])
    assert.deepEqual(getEntryHeaders(entries[0]), headerRule.headers)
    assert.deepEqual(normalizeRequestHeaderRules(entries), entries)
  }
})

test('switching a Switch Rule replaces its header set while preserving Header Rules and priority order', () => {
  const entries = normalizeRequestHeaderRules([
    { ...headerRule, kind: 'switch-rule', order: 6, options, selectedOptionId: 'admin' },
    { ...headerRule, id: 'regular', order: 4 },
  ])
  assert.deepEqual(entries.map((entry) => [entry.id, entry.order]), [['regular', 0], ['authentication', 1]])
  const switchRule = entries[1]
  if (switchRule.kind !== 'switch-rule') throw new Error('Expected Switch Rule')
  const switched = { ...switchRule, selectedOptionId: 'guest' }
  assert.deepEqual(getEntryHeaders(switched), [{ key: 'X-Role', value: 'guest' }])
  assert.deepEqual(getEntryHeaders(switchRule), [{ key: 'Authorization', value: 'admin' }])
  assert.deepEqual(getEntryHeaders(entries[0]), headerRule.headers)
})

test('deleting the selected option falls back to an existing option without changing Switch Rule type', () => {
  const [entry] = normalizeRequestHeaderRules([{ ...headerRule, kind: 'switch-rule', options: [options[0]], selectedOptionId: 'guest' }])
  if (entry.kind !== 'switch-rule') throw new Error('Expected Switch Rule')
  assert.equal(entry.selectedOptionId, 'admin')
  assert.deepEqual(getSelectedOption(entry).headers, options[0].headers)
})

test('normalization supplies unique option IDs and preserves all valid header sets', () => {
  const [entry] = normalizeRequestHeaderRules([{ ...headerRule, kind: 'switch-rule', options: [
    { id: 'same', name: ' A ', headers: [{ key: ' X-A ', value: ' a ' }] },
    { id: 'same', name: 'B', headers: [{ key: 'X-B', value: 'b' }] },
    { name: 'C', headers: [{ key: 'X-C', value: 'c' }, null] },
  ] }])
  if (entry.kind !== 'switch-rule') throw new Error('Expected Switch Rule')
  assert.equal(new Set(entry.options.map((option) => option.id)).size, 3)
  assert.deepEqual(entry.options.map((option) => option.headers), [
    [{ key: 'X-A', value: 'a' }], [{ key: 'X-B', value: 'b' }], [{ key: 'X-C', value: 'c' }],
  ])
})

test('Header Rule and Switch Rule drafts do not mutate stored header data', () => {
  const [rule, switchRule] = normalizeRequestHeaderRules([headerRule, { ...headerRule, id: 'switch-rule', kind: 'switch-rule', options }])
  if (rule.kind !== 'header-rule' || switchRule.kind !== 'switch-rule') throw new Error('Expected both types')
  const headerRuleDraft = headerRuleToDraft(rule)
  const switchRuleDraft = switchRuleToDraft(switchRule)
  headerRuleDraft.headers[0].value = 'changed'
  switchRuleDraft.options[0].headers[0].value = 'changed'
  assert.equal(rule.headers[0].value, 'Bearer original')
  assert.equal(switchRule.options[0].headers[0].value, 'admin')
})

test('new drafts have distinct shapes and empty Switch Rules always have an option', () => {
  const rule = createHeaderRuleDraft()
  const switchRule = createSwitchRuleDraft()
  assert.equal('options' in rule, false)
  assert.deepEqual(rule.headers, [{ key: '', value: '' }])
  assert.equal(getSelectedOption(switchRule).id, switchRule.selectedOptionId)
  const [entry] = normalizeRequestHeaderRules([{ ...headerRule, kind: 'switch-rule', headers: [], options: [] }])
  if (entry.kind !== 'switch-rule') throw new Error('Expected Switch Rule')
  assert.equal(getEntryHeaders(entry).length, 0)
})
