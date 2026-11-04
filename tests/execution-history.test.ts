import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createExecutionHistory, createHeaderMatchReader } from '../src/lib/execution-history.ts'
import type { ExecutionRecord } from '../src/lib/execution-history.ts'

const execution = (id: string, time = 100): ExecutionRecord => ({ id, time, startedAt: time, source: 'interceptor', result: 'Mocked',
  rule: { id: 'rule', kind: 'network-rule', name: 'Profile', url: 'localhost', headers: [] },
  request: { url: 'https://api.example/profile', method: 'GET' }, response: { status: 200, headers: [], body: 'original' } })

test('execution history freezes the rule and response used even after settings change', () => {
  const history = createExecutionHistory({ now: () => 50 })
  const entry = execution('first')
  history.add(entry)
  entry.rule.name = 'Edited'
  entry.response!.body = 'edited'
  assert.equal(history.getSnapshot().records[0].rule.name, 'Profile')
  assert.equal(history.getSnapshot().records[0].response?.body, 'original')
})

test('Pause excludes executions begun while paused and Clear rejects delayed reports from old history', () => {
  let clock = 50
  const history = createExecutionHistory({ now: () => clock })
  clock = 100
  history.pause()
  history.add(execution('in-flight', 90))
  history.add(execution('paused', 110))
  clock = 120
  history.resume()
  history.add(execution('still-paused', 115))
  history.add(execution('resumed', 121))
  assert.deepEqual(history.getSnapshot().records.map(entry => entry.id), ['in-flight', 'resumed'])
  clock = 130
  history.clear()
  history.add(execution('delayed', 125))
  history.add(execution('new', 131))
  assert.deepEqual(history.getSnapshot().records.map(entry => entry.id), ['new'])
})

test('history uses one budget, evicts oldest executions and omits a body that cannot fit', () => {
  const history = createExecutionHistory({ now: () => 0, budget: 2200 })
  history.add(execution('first', 100))
  history.add(execution('second', 110))
  const large = execution('large', 120)
  large.response!.body = 'x'.repeat(4000)
  history.add(large)
  const state = history.getSnapshot()
  assert.ok(state.bytes <= 2200)
  assert.equal(state.records.at(-1)?.response?.body, undefined)
  assert.match(state.records.at(-1)?.response?.bodyOmitted ?? '', /history budget/)
  assert.equal(state.records.at(-1)?.rule.name, 'Profile')
  assert.ok(state.removed > 0)
  assert.equal(state.records.some(entry => entry.id === 'first'), false)
})

test('Chrome occurrences survive overlapping polls, equal timestamps and navigation without fabricated request identity', () => {
  const history = createExecutionHistory({ now: () => 0 })
  const reader = createHeaderMatchReader(42, history, 0)
  const installed = [{ id: 1000, tabId: 42, signature: 'version-1', rule: { ...execution('x').rule, kind: 'header-rule' as const } }]
  const match = { rule: { ruleId: 1000, rulesetId: '_session' }, timeStamp: 100, tabId: 42 }
  reader.read([match, match], installed)
  reader.read([match, match], installed)
  reader.read([{ ...match, tabId: -1 }, { ...match, tabId: -1 }, { ...match, tabId: -1 }], installed)
  assert.equal(history.getSnapshot().records.length, 3)
  assert.ok(history.getSnapshot().records.every(record => record.request === undefined && record.result === 'Matched'))
  assert.equal(reader.since, 100)
})

test('separate header observations pair browser request stages without creating execution rows and share the budget', () => {
  const history = createExecutionHistory({ now: () => 100, budget: 2200 })
  history.add(execution('first', 80))
  history.add(execution('second', 90))
  history.observe({ id: 'browser-1', url: 'https://api.example/', method: 'GET', before: [{ key: 'X-Account', value: 'original' }] }, 'before')
  history.observe({ id: 'browser-1', url: 'https://api.example/', method: 'GET', after: [{ key: 'X-Account', value: 'x'.repeat(300) }] }, 'after')
  assert.equal(history.getSnapshot().observations.length, 1)
  assert.equal(history.getSnapshot().observations[0].before?.[0].value, 'original')
  assert.equal(history.getSnapshot().observations[0].after?.[0].value.length, 300)
  assert.ok(history.getSnapshot().records.length < 2)
  assert.ok(history.getSnapshot().bytes <= 2200)
  history.clear()
  assert.deepEqual(history.getSnapshot().observations, [])
})

test('a delayed Chrome batch is retained in execution order and evicts the oldest records together', () => {
  const history = createExecutionHistory({ now: () => 0, budget: 1800 })
  history.addMany([execution('newest', 300), execution('oldest', 100), execution('middle', 200)])
  assert.deepEqual(history.getSnapshot().records.map(record => record.id), ['middle', 'newest'])
  assert.equal(history.getSnapshot().removed, 1)
})

test('oversized execution metadata is rejected explicitly while retaining existing history', () => {
  const history = createExecutionHistory({ now: () => 0, budget: 1800 })
  history.add(execution('retained'))
  const oversized = execution('metadata')
  oversized.rule.name = 'x'.repeat(3000)
  history.add(oversized)
  assert.deepEqual(history.getSnapshot().records.map(record => record.id), ['retained'])
  assert.equal(history.getSnapshot().removed, 1)
  assert.match(history.getSnapshot().notice, /metadata exceeds/)
})

test('oversized observations preserve execution history and produce an explicit omission notice', () => {
  const history = createExecutionHistory({ now: () => 0, budget: 1800 })
  history.add(execution('retained'))
  history.observe({ id: 'large', method: 'GET', url: 'https://example.test', before: [{ key: 'X-Large', value: 'x'.repeat(3000) }] }, 'before')
  assert.deepEqual(history.getSnapshot().records.map(record => record.id), ['retained'])
  assert.deepEqual(history.getSnapshot().observations, [])
  assert.equal(history.getSnapshot().removed, 0)
  assert.match(history.getSnapshot().notice, /observation exceeds/)
})

test('failed execution snapshots omit an oversized configured body with a reason while keeping the failure', () => {
  const history = createExecutionHistory({ now: () => 0, budget: 2200 })
  history.add({ ...execution('failed'), result: 'Failed', response: undefined, error: 'Connection failed',
    rule: { ...execution('template').rule, body: 'x'.repeat(4000) } })
  const [record] = history.getSnapshot().records
  assert.equal(record.result, 'Failed')
  assert.equal(record.error, 'Connection failed')
  assert.equal(record.rule.body, undefined)
  assert.match(record.rule.bodyOmitted ?? '', /history budget/)
  assert.ok(history.getSnapshot().bytes <= 2200)
})
