import assert from 'node:assert/strict'
import { test } from 'node:test'
import { commitWebsiteDomainDrafts, removeWebsiteDomain } from '../src/lib/website-domain-draft.ts'

test('removing down to one keeps the saved domain visible while an addition is pending', () => {
  assert.deepEqual(removeWebsiteDomain(['a.test', 'b.test'], 0, { text: 'c.test', editing: null }), {
    value: 'b.test', text: 'c.test', editing: null, pending: true,
  })
})

test('removing down to one keeps the saved domain separate from the manager input', () => {
  for (const draft of [{ text: '', editing: null }, { text: 'edited-a.test', editing: 0 }]) {
    assert.deepEqual(removeWebsiteDomain(['a.test', 'b.test'], 0, draft), {
      value: 'b.test', text: '', editing: null, pending: false,
    })
  }
})

test('removal preserves pending edits and adjusts their position', () => {
  assert.deepEqual(removeWebsiteDomain(['a.test', 'b.test'], 0, { text: 'edited-b.test', editing: 1 }), {
    value: 'b.test', text: 'edited-b.test', editing: 0, pending: true,
  })
})

test('removing the last edited domain clears its draft', () => {
  assert.deepEqual(removeWebsiteDomain('a.test', 0, { text: 'edited-a.test', editing: 0 }), {
    value: [], text: '', editing: null, pending: false,
  })
})

test('Save combines a manager edit and an independent creation without mutating either draft', () => {
  const scope = ['a.test', 'b.test']
  const manager = { text: 'https://C.TEST/path', editing: 0 }
  assert.deepEqual(commitWebsiteDomainDrafts(scope, 'https://D.TEST/path', manager), {
    ok: true, value: ['c.test', 'b.test', 'd.test'],
  })
  assert.deepEqual(scope, ['a.test', 'b.test'])
  assert.deepEqual(manager, { text: 'https://C.TEST/path', editing: 0 })
})

test('Save can commit either input while the other is empty', () => {
  assert.deepEqual(commitWebsiteDomainDrafts('a.test', 'b.test', { text: '', editing: null }), {
    ok: true, value: ['a.test', 'b.test'],
  })
  assert.deepEqual(commitWebsiteDomainDrafts('a.test', '', { text: 'b.test', editing: 0 }), {
    ok: true, value: 'b.test',
  })
})

test('Save reports cross-input duplicates against the proposed edit without partially applying it', () => {
  const scope = ['a.test', 'b.test']
  assert.deepEqual(commitWebsiteDomainDrafts(scope, 'c.test', { text: 'c.test', editing: 0 }), {
    ok: false, field: 'creation', message: 'This domain is already in the list.',
  })
  assert.deepEqual(scope, ['a.test', 'b.test'])
  assert.deepEqual(commitWebsiteDomainDrafts(scope, 'a.test', { text: 'c.test', editing: 0 }), {
    ok: true, value: ['c.test', 'b.test', 'a.test'],
  })
})

test('Save identifies the invalid input and rejects a cleared manager edit', () => {
  assert.deepEqual(commitWebsiteDomainDrafts('a.test', 'b.test', { text: '', editing: 0 }), {
    ok: false, field: 'manager', message: 'Enter a domain or remove it from the list.',
  })
  const invalid = commitWebsiteDomainDrafts('a.test', 'bad host', { text: 'b.test', editing: 0 })
  assert.equal(invalid.ok, false)
  if (!invalid.ok) assert.equal(invalid.field, 'creation')
})

test('Save combines separate additions and detects when they duplicate each other', () => {
  assert.deepEqual(commitWebsiteDomainDrafts([], 'a.test', { text: 'b.test', editing: null }), {
    ok: true, value: ['b.test', 'a.test'],
  })
  assert.deepEqual(commitWebsiteDomainDrafts([], 'a.test', { text: 'a.test', editing: null }), {
    ok: false, field: 'creation', message: 'This domain is already in the list.',
  })
})
