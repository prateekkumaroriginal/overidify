import assert from 'node:assert/strict'
import { test } from 'node:test'
import { removeWebsiteDomain } from '../src/lib/website-domain-draft.ts'

test('removing down to one keeps the saved domain visible while an addition is pending', () => {
  assert.deepEqual(removeWebsiteDomain(['a.test', 'b.test'], 0, { text: 'c.test', editing: null }), {
    value: 'b.test', text: 'c.test', editing: null, listMode: true, pending: true,
  })
})

test('removing down to one prefills the remaining domain when there is no addition', () => {
  for (const draft of [{ text: '', editing: null }, { text: 'edited-a.test', editing: 0 }]) {
    assert.deepEqual(removeWebsiteDomain(['a.test', 'b.test'], 0, draft), {
      value: 'b.test', text: 'b.test', editing: 0, listMode: false, pending: false,
    })
  }
})

test('removal preserves pending edits and adjusts their position', () => {
  assert.deepEqual(removeWebsiteDomain(['a.test', 'b.test'], 0, { text: 'edited-b.test', editing: 1 }), {
    value: 'b.test', text: 'edited-b.test', editing: 0, listMode: false, pending: true,
  })
})

test('removing the last edited domain clears its draft and hides the manager', () => {
  assert.deepEqual(removeWebsiteDomain('a.test', 0, { text: 'edited-a.test', editing: 0 }), {
    value: [], text: '', editing: null, listMode: false, pending: false,
  })
})
