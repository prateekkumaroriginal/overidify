import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectVariableReferences, normalizeVariables, planVariablesSave, variableNameError, variableValues } from '../src/lib/variables.ts'
import type { Variable } from '../src/lib/variables.ts'
import { saveVariables } from '../src/lib/variables-storage.ts'
import { createNetworkRuleDraft } from '../src/lib/network-rules.ts'
import type { NetworkRule } from '../src/lib/network-rules.ts'
import { resolveRules } from '../src/lib/resolve-rules.ts'
import type { RequestHeaderRule } from '../src/lib/types.ts'

const ref = (name: string) => ({ variable: name })
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const variable = (n: number, name: string, value = `value-${n}`): Variable => ({ id: id(n), name, value })

function rules() {
  const requestHeaderRules: RequestHeaderRule[] = [
    { kind: 'header-rule', id: id(101), name: 'API auth', url: 'localhost:4200', enabled: false, order: 0,
      headers: [{ key: 'Authorization', value: { template: ['Bearer ', ref('AUTH')] } }, { key: 'X-Literal', value: '{{AUTH}}' }] },
    { kind: 'switch-rule', id: id(102), name: 'Env', url: '*', enabled: true, order: 1, selectedOptionId: id(201), options: [
      { id: id(201), name: 'Production', headers: [{ key: 'X-Env', value: 'prod' }] },
      { id: id(202), name: { template: [ref('AUTH'), ' staging'] }, headers: [{ key: 'X-Token', value: { template: [ref('AUTH')] } }] },
    ] },
  ]
  const networkRules: NetworkRule[] = [{ ...createNetworkRuleDraft(), id: id(103), name: 'Mock', order: 0, url: { template: [ref('TENANT'), '.example.com'] },
    requestUrl: { template: ['https://', ref('TENANT'), '.api.test/me'] }, body: { template: ['{"token":"', ref('AUTH'), '"}'] } }]
  return { requestHeaderRules, networkRules }
}

test('normalization drops malformed entries, repairs IDs, keeps the first duplicate name, and keeps invalid names unresolvable', () => {
  const normalized = normalizeVariables([null, 'x', { name: 'A' }, { name: 'A', value: 1 }, { id: 'bad', name: 'GOOD', value: ' keep\n ' },
    { id: id(1), name: 'GOOD', value: 'second' }, { id: id(2), name: 'bad-name', value: 'x' }, { id: id(2), name: 'OTHER', value: '' }])
  assert.deepEqual(normalized.map(item => [item.name, item.value]), [['GOOD', ' keep\n '], ['bad-name', 'x'], ['OTHER', '']])
  assert.match(normalized[0].id, /^[0-9a-f-]{36}$/)
  assert.equal(normalized[1].id, id(2))
  assert.notEqual(normalized[2].id, id(2))
  assert.deepEqual([...variableValues(normalized)], [['GOOD', ' keep\n '], ['OTHER', '']])
  assert.equal(variableNameError('AUTH-TOKEN'), 'Use letters, digits, and underscores, starting with a letter or underscore.')
  assert.equal(variableNameError('9LIVES'), 'Use letters, digits, and underscores, starting with a letter or underscore.')
  assert.equal(variableNameError('A'.repeat(65)), 'Use 64 characters or fewer.')
  assert.equal(variableNameError('_ok9'), '')
})

test('Save applies the draft by ID and keeps changes another window saved to rows this draft did not touch', () => {
  const baseline = [variable(1, 'AUTH', 'old'), variable(2, 'TENANT', 'acme'), variable(3, 'GONE', 'x'), variable(4, 'EDITED_ELSEWHERE', 'a')]
  // Another window changed TENANT, deleted EDITED_ELSEWHERE, and created OTHER_WINDOW.
  const stored = [variable(1, 'AUTH', 'old'), variable(2, 'TENANT', 'globex'), variable(3, 'GONE', 'x'), variable(5, 'OTHER_WINDOW', 'y')]
  const draft = [variable(1, 'AUTH', 'new'), variable(2, 'TENANT', 'acme'), variable(4, 'EDITED_ELSEWHERE', 'b'), variable(6, 'ADDED', '')]
  const plan = planVariablesSave({ stored, baseline, draft, rules: { requestHeaderRules: [], networkRules: [] } })
  assert.ok(plan.ok)
  assert.deepEqual(plan.variables.map(item => [item.name, item.value]).sort(), [
    ['ADDED', ''], ['AUTH', 'new'], ['EDITED_ELSEWHERE', 'b'], ['OTHER_WINDOW', 'y'], ['TENANT', 'globex'],
  ])
  assert.equal(plan.variables.find(item => item.name === 'EDITED_ELSEWHERE')?.id, id(4))
})

test('a name collision with another window, or an invalid draft name, fails Save without changes', () => {
  const stored = [variable(1, 'AUTH'), variable(5, 'NEW_NAME')]
  const conflict = planVariablesSave({ stored, baseline: [variable(1, 'AUTH')], draft: [variable(1, 'AUTH'), variable(6, 'NEW_NAME')], rules: rules() })
  assert.deepEqual(conflict, { ok: false, errors: { [id(6)]: 'Another variable already uses this name.' } })
  const invalid = planVariablesSave({ stored, baseline: stored, draft: [variable(1, 'BAD NAME'), variable(5, 'NEW_NAME'), variable(7, 'NEW_NAME')], rules: rules() })
  assert.deepEqual(invalid, { ok: false, errors: { [id(1)]: 'Use letters, digits, and underscores, starting with a letter or underscore.', [id(7)]: 'Another variable already uses this name.' } })
})

test('rename rewrites references in every saved rule, including disabled rules and unselected options, but not literal text', () => {
  const stored = [variable(1, 'AUTH'), variable(2, 'TENANT')]
  const plan = planVariablesSave({ stored, baseline: stored, draft: [variable(1, 'API_TOKEN'), variable(2, 'TENANT')], rules: rules() })
  assert.ok(plan.ok)
  assert.deepEqual([...plan.renames], [['AUTH', 'API_TOKEN']])
  assert.equal(plan.headerChanged && plan.networkChanged, true)
  const [header, switchRule] = plan.rules.requestHeaderRules
  assert.deepEqual(header.kind === 'header-rule' && header.headers, [
    { key: 'Authorization', value: { template: ['Bearer ', ref('API_TOKEN')] } }, { key: 'X-Literal', value: '{{AUTH}}' },
  ])
  assert.ok(switchRule.kind === 'switch-rule')
  assert.deepEqual(switchRule.options[1].name, { template: [ref('API_TOKEN'), ' staging'] })
  assert.deepEqual(switchRule.options[1].headers[0].value, { template: [ref('API_TOKEN')] })
  assert.deepEqual(plan.rules.networkRules[0].body, { template: ['{"token":"', ref('API_TOKEN'), '"}'] })
  assert.equal(plan.newlyMissing.size, 0)
})

test('renames apply as one simultaneous mapping, so two names can be swapped in one Save', () => {
  const stored = [variable(1, 'AUTH'), variable(2, 'TENANT')]
  const plan = planVariablesSave({ stored, baseline: stored, draft: [variable(1, 'TENANT'), variable(2, 'AUTH')], rules: rules() })
  assert.ok(plan.ok)
  assert.deepEqual(plan.rules.networkRules[0].url, { template: [ref('AUTH'), '.example.com'] })
  assert.deepEqual(plan.rules.networkRules[0].body, { template: ['{"token":"', ref('TENANT'), '"}'] })
})

test('deleting a referenced variable needs confirmation, keeps references, and recreating the name repairs them', async () => {
  const stored = [variable(1, 'AUTH', 'secret'), variable(2, 'TENANT', 'acme'), variable(3, 'UNUSED')]
  const unreferenced = planVariablesSave({ stored, baseline: stored, draft: stored.slice(0, 2), rules: rules() })
  assert.ok(unreferenced.ok && unreferenced.newlyMissing.size === 0)
  const plan = planVariablesSave({ stored, baseline: stored, draft: [stored[1], stored[2]], rules: rules() })
  assert.ok(plan.ok)
  assert.deepEqual([...plan.newlyMissing.keys()], ['AUTH'])
  assert.deepEqual(plan.newlyMissing.get('AUTH')!.map(usage => [usage.name, usage.fields]), [
    ['API auth', ['Header value']], ['Env', ['Option "{{AUTH}} staging" · Option name', 'Option "{{AUTH}} staging" · Header value']], ['Mock', ['Response body']],
  ])
  assert.equal(plan.headerChanged || plan.networkChanged, false)
  const after = resolveRules(plan.rules, variableValues(plan.variables))
  assert.equal(after.byId.get(id(103))?.active, false)
  assert.equal(plan.rules.networkRules[0].enabled, true)
  const recreated = resolveRules(plan.rules, variableValues([...plan.variables, variable(9, 'AUTH', 'again')]))
  assert.equal(recreated.byId.get(id(103))?.active, true)
})

function storage(initial: Record<string, unknown>, failWrites = false) {
  const data = structuredClone(initial)
  const messages: unknown[] = []
  Object.assign(globalThis, { chrome: {
    storage: { local: {
      get: async (key: string) => ({ [key]: structuredClone(data[key]) }),
      set: async (changes: Record<string, unknown>) => { if (failWrites) throw new Error('QUOTA_BYTES quota exceeded'); Object.assign(data, structuredClone(changes)) },
    } },
    runtime: { sendMessage: async (message: unknown) => { messages.push(message); return { ok: true, reloadTabIds: [] } } },
  } })
  return { data, messages }
}

test('saveVariables writes variables and renamed rules together, asks before deleting referenced variables, and activates', async () => {
  const previous = globalThis.chrome
  try {
    const stored = [variable(1, 'AUTH', 'secret'), variable(2, 'TENANT', 'acme')]
    const { data, messages } = storage({ variables: stored, ...rules() })
    const renamed = await saveVariables({ baseline: stored, draft: [variable(1, 'API_TOKEN', 'secret'), stored[1]] })
    assert.equal(renamed.status, 'saved')
    assert.deepEqual((data.variables as Variable[]).map(item => item.name), ['API_TOKEN', 'TENANT'])
    assert.match(JSON.stringify(data.requestHeaderRules), /API_TOKEN/)
    assert.doesNotMatch(JSON.stringify(data.requestHeaderRules), /"variable":"AUTH"/)
    assert.deepEqual(messages.map(message => (message as { type: string }).type).sort(), ['sync-network-rules', 'sync-request-header-rules'])

    const current = data.variables as Variable[]
    const confirm = await saveVariables({ baseline: current, draft: [current[1]] })
    assert.equal(confirm.status, 'confirm')
    assert.equal((data.variables as Variable[]).length, 2)
    assert.equal((await saveVariables({ baseline: current, draft: [current[1]], confirmDeletes: true })).status, 'saved')
    assert.deepEqual((data.variables as Variable[]).map(item => item.name), ['TENANT'])
    assert.ok(collectVariableReferences({ requestHeaderRules: data.requestHeaderRules as RequestHeaderRule[], networkRules: [] }).has('API_TOKEN'))
  } finally { Object.assign(globalThis, { chrome: previous }) }
})

test('a storage failure leaves variables and rules unchanged and reports an application message', async () => {
  const previous = globalThis.chrome
  try {
    const stored = [variable(1, 'AUTH', 'sentinel-value-9f2')]
    const before = { variables: stored, ...rules() }
    const { data, messages } = storage(before, true)
    await assert.rejects(saveVariables({ baseline: stored, draft: [variable(1, 'RENAMED', 'sentinel-value-9f2')] }),
      { message: 'Variables were not saved. Your previous variables are still in use.' })
    assert.deepEqual(data, before)
    assert.deepEqual(messages, [])
  } finally { Object.assign(globalThis, { chrome: previous }) }
})
