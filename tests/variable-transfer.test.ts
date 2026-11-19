import assert from 'node:assert/strict'
import { test } from 'node:test'
import { exportRules, reviewImport } from '../src/lib/rule-transfer.ts'
import { saveImportedRules } from '../src/lib/rule-transfer-storage.ts'
import { updateRequestHeaderRules } from '../src/lib/request-header-storage.ts'
import { saveVariables } from '../src/lib/variables-page-storage.ts'
import { createVariable } from '../src/lib/variables-storage.ts'
import { resolveRules } from '../src/lib/rule-resolution.ts'
import { createNetworkRuleDraft } from '../src/lib/network-rules.ts'
import type { NetworkRule } from '../src/lib/network-rules.ts'
import type { Variable } from '../src/lib/variables.ts'
import type { HeaderRule, RequestHeaderRule } from '../src/lib/types.ts'
import type { TemplateText, VariableToken } from '../src/lib/templates.ts'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const token = (n: number, name: string): VariableToken => ({ variableId: id(n), name })
const tpl = (...segments: (string | VariableToken)[]): TemplateText => ({ segments })
const SENTINEL = 'sentinel-secret-7f3'
const AUTH: Variable = { id: id(1), name: 'STAGE_AUTH_TOKEN', value: SENTINEL, secret: true }
const rule = (patch: Partial<HeaderRule> = {}): HeaderRule => ({ kind: 'header-rule', id: id(101), name: 'Stage API', url: 'localhost:4200', enabled: true, order: 0,
  headers: [{ key: 'Authorization', value: tpl('Bearer ', token(1, 'STAGE_AUTH_TOKEN')) }], ...patch })

function storage(initial: Record<string, unknown>) {
  const data = structuredClone(initial)
  const writes: string[][] = []
  const previous = globalThis.chrome
  Object.assign(globalThis, { chrome: {
    storage: { local: {
      get: async (key: string) => ({ [key]: structuredClone(data[key]) }),
      set: async (changes: Record<string, unknown>) => { writes.push(Object.keys(changes)); Object.assign(data, structuredClone(changes)) },
    } },
    runtime: { sendMessage: async () => ({ ok: true, reloadTabIds: [] }) },
  } })
  return { data, writes, restore: () => Object.assign(globalThis, { chrome: previous }) }
}

test('exports name variables, never their values, and mark the file version 3', () => {
  const network: NetworkRule = { ...createNetworkRuleDraft(), id: id(103), name: 'Me', order: 0, url: 'localhost:4200', requestUrl: 'https://api.test/me',
    body: tpl('{"token":"', token(1, 'STAGE_AUTH_TOKEN'), '"}') }
  const text = exportRules({ requestHeaderRules: [rule()], networkRules: [network] })
  const parsed = JSON.parse(text)
  assert.equal(parsed.version, 3)
  assert.deepEqual(parsed.requestHeaderRules[0].headers[0].value, { segments: ['Bearer ', { variable: 'STAGE_AUTH_TOKEN' }] })
  assert.doesNotMatch(text, new RegExp(SENTINEL))
  assert.doesNotMatch(text, /variableId/)
  assert.equal(JSON.parse(exportRules({ requestHeaderRules: [rule({ headers: [{ key: 'X', value: '{{STAGE_AUTH_TOKEN}}' }] })], networkRules: [] })).version, 1)
})

test('imports link variables by name ignoring case, list missing names, and keep {{NAME}} text in older files literal', () => {
  const exported = exportRules({ requestHeaderRules: [rule(), rule({ id: id(102), headers: [{ key: 'X-Tenant', value: tpl(token(9, 'TENANT')) }] })], networkRules: [] })
  const local: Variable = { id: id(5), name: 'stage_auth_token', value: 'local', secret: false }
  const review = reviewImport(exported, { requestHeaderRules: [], networkRules: [] }, [local])
  assert.deepEqual(review.issues, [])
  assert.deepEqual(review.variables, { used: ['STAGE_AUTH_TOKEN', 'TENANT'], missing: ['TENANT'] })
  assert.deepEqual((review.rules.requestHeaderRules[0] as HeaderRule).headers[0].value, tpl('Bearer ', { variableId: id(5), name: 'STAGE_AUTH_TOKEN' }))
  const resolved = resolveRules(review.rules, [local])
  assert.equal(resolved.requestHeaderRules[0].headers[0].value, 'Bearer local')

  const older = JSON.stringify({ format: 'overidify', version: 1, requestHeaderRules: [rule({ headers: [{ key: 'X', value: '{{STAGE_AUTH_TOKEN}}' }] })], networkRules: [] })
  const literal = reviewImport(older, { requestHeaderRules: [], networkRules: [] }, [local])
  assert.deepEqual((literal.rules.requestHeaderRules[0] as HeaderRule).headers[0].value, '{{STAGE_AUTH_TOKEN}}')
  const invalidName = JSON.stringify({ format: 'overidify', version: 3, networkRules: [],
    requestHeaderRules: [rule({ headers: [{ key: 'X', value: { segments: [{ variable: 'bad name' }] } as never }] })] })
  assert.equal(reviewImport(invalidName, { requestHeaderRules: [], networkRules: [] }, []).issues.length, 1)
})

test('imported rules that use missing variables are saved turned off', async () => {
  const { data, restore } = storage({ variables: [] })
  try {
    const review = reviewImport(exportRules({ requestHeaderRules: [rule()], networkRules: [] }), { requestHeaderRules: [], networkRules: [] }, [])
    await saveImportedRules(review.rules)
    assert.equal((data.requestHeaderRules as RequestHeaderRule[])[0].enabled, false)
  } finally { restore() }
})

test('a rule saved with a missing variable is stored turned off and stays off once the variable exists', async () => {
  const { data, restore } = storage({ variables: [], requestHeaderRules: [] })
  try {
    const saved = await updateRequestHeaderRules(() => [rule()])
    assert.equal(saved[0].enabled, false)
    assert.equal((data.requestHeaderRules as RequestHeaderRule[])[0].enabled, false)
    const created = await createVariable({ name: 'STAGE_AUTH_TOKEN', value: 'x', secret: true })
    assert.ok(created.ok)
    assert.deepEqual(await createVariable({ name: 'stage_auth_token', value: 'y', secret: false }), { ok: false, error: 'Another variable already has this name.' })
    assert.equal((data.requestHeaderRules as RequestHeaderRule[])[0].enabled, false)
    const enabled = await updateRequestHeaderRules(rules => rules.map(item => ({ ...item, enabled: true })))
    assert.equal(enabled[0].enabled, true)
  } finally { restore() }
})

test('deleting a variable in use asks first, then writes the variables and the turned-off rules together', async () => {
  const { data, writes, restore } = storage({ variables: [AUTH], requestHeaderRules: [rule()], networkRules: [] })
  try {
    const confirm = await saveVariables({ baseline: [AUTH], draft: [] })
    assert.deepEqual(confirm, { status: 'confirm', turnedOff: [{ id: id(101), name: 'Stage API', type: 'header-rule' }] })
    assert.deepEqual(writes, [])
    const saved = await saveVariables({ baseline: [AUTH], draft: [], confirmTurnOff: true })
    assert.equal(saved.status, 'saved')
    assert.deepEqual(writes, [['variables', 'requestHeaderRules']])
    assert.deepEqual(data.variables, [])
    assert.equal((data.requestHeaderRules as RequestHeaderRule[])[0].enabled, false)
  } finally { restore() }
})
