import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyImport, copyName, exportRules, reviewImport } from '../src/lib/rule-transfer.ts'
import type { RuleCollection } from '../src/lib/rule-transfer.ts'
import { duplicateSavedRule } from '../src/lib/rule-transfer-storage.ts'
import { createNetworkRuleDraft } from '../src/lib/network-rules.ts'
import type { TemplateText } from '../src/lib/templates.ts'

const SENTINEL = 'sentinel-export-5ab'
const ref = (name: string) => ({ variable: name })
const tpl = (...parts: (string | { variable: string })[]): TemplateText => ({ template: parts })
const empty: RuleCollection = { requestHeaderRules: [], networkRules: [] }
const header = { kind: 'header-rule' as const, id: '8d1f5a0e-2b7c-4f7e-9a1d-3c2b1a0f9e8d', name: 'API auth', url: tpl(ref('TENANT'), '.example.com'), enabled: true, order: 0,
  headers: [{ key: 'Authorization', value: tpl('Bearer ', ref('AUTH_TOKEN')) }] }
const literal = { ...createNetworkRuleDraft(), id: '00000000-0000-4000-8000-000000000081', name: 'Mustache', order: 0, url: 'example.com',
  requestUrl: 'https://api.test/x', body: 'Hello {{NAME}}' }

test('exports use version 3 only when a rule holds a reference, and never include variable values', () => {
  const withReferences = exportRules({ requestHeaderRules: [header], networkRules: [] })
  assert.equal(JSON.parse(withReferences).version, 3)
  assert.deepEqual(JSON.parse(withReferences).requestHeaderRules[0].headers, header.headers)
  assert.deepEqual(Object.keys(JSON.parse(withReferences)), ['format', 'version', 'requestHeaderRules', 'networkRules'])
  assert.doesNotMatch(withReferences, new RegExp(SENTINEL))
  assert.equal(JSON.parse(exportRules({ requestHeaderRules: [], networkRules: [literal] })).version, 1)
  assert.equal(JSON.parse(exportRules({ requestHeaderRules: [], networkRules: [{ ...literal, url: ['a.test', 'b.test'] }] })).version, 2)
})

test('imports bind references by exact name, list used and missing names, and never read values from a file', () => {
  const file = JSON.stringify({ format: 'overidify', version: 3, variables: [{ name: 'AUTH_TOKEN', value: SENTINEL }],
    requestHeaderRules: [{ ...header, headers: [{ key: 'Authorization', value: { template: ['Bearer ', { variable: 'AUTH_TOKEN', value: SENTINEL }] } }] }],
    networkRules: [] })
  const review = reviewImport(file, empty, ['AUTH_TOKEN', 'auth'])
  assert.deepEqual(review.issues, [])
  assert.deepEqual(review.variables, { used: ['AUTH_TOKEN'], missing: ['TENANT'] })
  assert.doesNotMatch(JSON.stringify(review), new RegExp(SENTINEL))
  const imported = applyImport(empty, review, 'add')
  assert.deepEqual(imported.requestHeaderRules[0].headers, header.headers)
  assert.equal(imported.requestHeaderRules[0].enabled, true)
  assert.deepEqual(reviewImport(file, empty, ['auth_token']).variables, { used: [], missing: ['AUTH_TOKEN', 'TENANT'] })
})

test('a version 3 reference with an invalid name makes only that rule invalid, while older files keep placeholder text literal', () => {
  const invalid = { ...header, id: '00000000-0000-4000-8000-000000000082', name: 'Bad', headers: [{ key: 'X', value: { template: [{ variable: 'AUTH-TOKEN' }] } }] }
  const review = reviewImport(JSON.stringify({ format: 'overidify', version: 3, requestHeaderRules: [header, invalid], networkRules: [] }), empty)
  assert.deepEqual(review.rules.requestHeaderRules.map(rule => rule.id), [header.id])
  assert.equal(review.issues.length, 1)
  assert.equal(review.issues[0].name, 'Bad')
  const older = reviewImport(JSON.stringify({ format: 'overidify', version: 1, requestHeaderRules: [], networkRules: [literal] }), empty, ['NAME'])
  assert.equal(older.rules.networkRules[0].body, 'Hello {{NAME}}')
  assert.deepEqual(older.variables, { used: [], missing: [] })
  const mislabeled = reviewImport(JSON.stringify({ format: 'overidify', version: 2, requestHeaderRules: [header], networkRules: [] }), empty)
  assert.deepEqual(mislabeled.issues.map(issue => issue.message), ['Variable references need export format version 3.'])
  const noncanonical = reviewImport(JSON.stringify({ format: 'overidify', version: 2, requestHeaderRules: [],
    networkRules: [{ ...literal, body: { template: ['Hello {{NAME}}'] } }] }), empty)
  assert.deepEqual(noncanonical.issues.map(issue => issue.message), ['Variable references need export format version 3.'])
})

test('copy names keep references and duplicates copy templates exactly', async () => {
  assert.deepEqual(copyName(tpl(ref('ENV'), ' admin'), []), tpl(ref('ENV'), ' admin (copy)'))
  assert.deepEqual(copyName(tpl(ref('ENV'), ' admin (copy)'), ['{{ENV}} admin (COPY)']), tpl(ref('ENV'), ' admin (copy 2)'))
  assert.deepEqual(copyName(tpl(ref('ENV')), []), tpl(ref('ENV'), ' (copy)'))
  assert.equal(copyName('  ', []), 'Untitled rule (copy)')
  const previous = globalThis.chrome
  const stored: Record<string, unknown> = { requestHeaderRules: [{ ...header, name: tpl(ref('ENV'), ' admin') }], networkRules: [] }
  Object.assign(globalThis, { chrome: {
    storage: { local: { get: async (key: string) => ({ [key]: structuredClone(stored[key]) }), set: async (next: Record<string, unknown>) => { Object.assign(stored, structuredClone(next)) } } },
    runtime: { sendMessage: async () => ({ ok: true }) },
  } })
  try {
    const { copy } = await duplicateSavedRule(header.id)
    assert.deepEqual(copy.name, tpl(ref('ENV'), ' admin (copy)'))
    assert.deepEqual(copy.url, header.url)
    assert.ok('kind' in copy && copy.kind === 'header-rule')
    assert.deepEqual(copy.headers, header.headers)
  } finally { Object.assign(globalThis, { chrome: previous }) }
})
