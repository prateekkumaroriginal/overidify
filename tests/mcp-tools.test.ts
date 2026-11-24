import assert from 'node:assert/strict'
import { test } from 'node:test'
import { callMcpTool, MCP_TOOLS } from '../src/lib/mcp-tools.ts'
import type { McpToolDeps } from '../src/lib/mcp-tools.ts'
import { getSavedRules, updateSavedRules } from '../src/lib/rule-transfer-storage.ts'
import type { TransferActivation } from '../src/lib/rule-transfer-storage.ts'
import type { RuleCollection } from '../src/lib/rule-transfer.ts'
import { getVariables } from '../src/lib/variables-storage.ts'
import { writeVariables } from '../src/lib/variables-page-storage.ts'
import type { Variable } from '../src/lib/variables.ts'

type View = { id: string; name: string; type: string; enabled: boolean; body?: string; bodyLength?: number; selectedOption?: string; problems?: string[]; headers?: { name: string; value: string }[] }
type Data = { rule: View; rules: View[]; activation: { applied: boolean; note: string }; deleted: View[]; notFound?: string[] }
type Schema = { required: string[]; additionalProperties: boolean; properties: Record<string, { default?: unknown }> }

type Stored = RuleCollection & { variables?: Variable[] }
function setup(initial: Stored = { requestHeaderRules: [], networkRules: [] }) {
  const state = { stored: structuredClone(initial) as Stored, writes: 0, activations: 0, activation: { ok: true, reloadTabIds: [] } as TransferActivation }
  const previousChrome = globalThis.chrome
  Object.assign(globalThis, { chrome: { storage: { local: {
    get: async (key: keyof Stored) => ({ [key]: structuredClone(state.stored[key]) }),
    set: async (rules: Partial<Stored>) => { state.writes++; Object.assign(state.stored, structuredClone(rules)) },
  } } } })
  const deps: McpToolDeps = {
    readRules: getSavedRules, readVariables: getVariables, updateRules: updateSavedRules, writeVariables,
    activate: async () => { state.activations++; return state.activation },
  }
  const call = async (name: string, args: unknown) => {
    const result = await callMcpTool(name, args, deps)
    return { ...result, data: result.structuredContent as Data, text: result.content[0].text }
  }
  return { state, call, restore: () => { Object.assign(globalThis, { chrome: previousChrome }) } }
}

test('tool schemas are published from the same definitions that validate arguments', () => {
  const create = MCP_TOOLS.find(tool => tool.name === 'create_network_rule')!
  const schema = create.inputSchema as Schema
  assert.deepEqual(schema.required, ['name', 'websites', 'requestUrl'])
  assert.equal(schema.additionalProperties, false)
  assert.equal(schema.properties.method.default, 'GET')
  assert.equal(MCP_TOOLS.find(tool => tool.name === 'list_rules')!.annotations?.readOnlyHint, true)
})

test('created rules are normalized, appended after existing rules, and activated', async () => {
  const { state, call, restore } = setup()
  try {
    const header = await call('create_header_rule', {
      name: '  Local token ', websites: ['http://localhost:4200/app', 'LOCALHOST:4200', '*.Example.com'],
      headers: [{ name: ' Authorization ', value: ' Bearer abc ' }, { name: '', value: '' }],
    })
    assert.equal(header.isError, undefined)
    assert.deepEqual(header.data.rule, {
      id: header.data.rule.id, type: 'header', name: 'Local token', enabled: true,
      websites: ['localhost:4200', '*.example.com'], headers: [{ name: 'Authorization', value: 'Bearer abc' }],
    })
    assert.deepEqual(header.data.activation, { applied: true })

    const network = await call('create_network_rule', { name: 'Chats', websites: ['*'], requestUrl: 'https://api.example.com/chats?b=2&a=1', body: '[]' })
    assert.deepEqual(state.stored.networkRules[0], {
      id: network.data.rule.id, name: 'Chats', url: '*', enabled: true, order: 0, requestUrl: 'https://api.example.com/chats?b=2&a=1',
      method: 'GET', mode: 'bypass', status: 200, body: '[]', headers: [{ key: 'Content-Type', value: 'application/json' }],
    })

    const switchRule = await call('create_switch_rule', {
      name: 'Accounts', websites: ['localhost:4200'], selectedOption: 'guest',
      options: [{ name: 'Admin', headers: [{ name: 'X-User', value: 'admin' }] }, { name: 'Guest', headers: [{ name: 'X-User', value: 'guest' }] }],
    })
    assert.equal(switchRule.data.rule.selectedOption, 'Guest')
    assert.deepEqual(state.stored.requestHeaderRules.map(rule => [rule.name, rule.order]), [['Local token', 0], ['Accounts', 1]])
    assert.equal(state.activations, 3)
  } finally { restore() }
})

test('invalid rules are rejected with field paths and are not saved', async () => {
  const { state, call, restore } = setup()
  try {
    const header = await call('create_header_rule', { name: ' ', websites: ['not a domain'], headers: [{ name: 'X-Only-Name', value: '' }] })
    assert.equal(header.isError, true)
    assert.match(header.text, /name: Header rule name is required\./)
    assert.match(header.text, /websites: Add a website domain/)
    assert.match(header.text, /headers\.0\.value: Each header pair needs a name and a value\./)

    const network = await call('create_network_rule', {
      name: 'Bad', websites: ['*'], requestUrl: '/relative', status: 99, headers: [{ name: 'Set-Cookie', value: 'a=b' }],
    })
    assert.match(network.text, /requestUrl: Enter a complete HTTP or HTTPS request URL\./)
    assert.match(network.text, /status: Use a status code from 200 to 599\./)
    assert.match(network.text, /Remove Set-Cookie/)

    const switchRule = await call('create_switch_rule', {
      name: 'Dupes', websites: ['*'], options: [{ name: 'A', headers: [{ name: 'X', value: '1' }] }, { name: 'a', headers: [{ name: 'X', value: '2' }] }],
    })
    assert.match(switchRule.text, /options\.1\.name: Give each option a different name\./)
    assert.match((await call('create_switch_rule', { name: 'Missing', websites: ['*'], selectedOption: 'Nope',
      options: [{ name: 'A', headers: [{ name: 'X', value: '1' }] }] })).text, /No option is named "Nope"/)

    assert.match((await call('create_header_rule', { name: 'Typo', websites: ['*'], headers: [{ name: 'X', value: '1' }], enable: false })).text,
      /Invalid arguments\..*enable/)
    assert.match((await call('drop_everything', {})).text, /Unknown tool/)
    assert.equal(state.writes, 0)
    assert.equal(state.activations, 0)
  } finally { restore() }
})

test('updates keep omitted fields, priority, and Switch option identities', async () => {
  const { state, call, restore } = setup()
  try {
    const first = await call('create_header_rule', { name: 'First', websites: ['*'], headers: [{ name: 'X-First', value: '1' }] })
    const created = await call('create_switch_rule', {
      name: 'Accounts', websites: ['localhost:4200'], selectedOption: 'Guest',
      options: [{ name: 'Admin', headers: [{ name: 'X-User', value: 'admin' }] }, { name: 'Guest', headers: [{ name: 'X-User', value: 'guest' }] }],
    })
    const id = created.data.rule.id
    const before = state.stored.requestHeaderRules[1]
    assert.equal(before.kind, 'switch-rule')

    const renamed = await call('update_rule', { id: id.toUpperCase(), name: 'Test accounts', enabled: false })
    assert.equal(renamed.data.rule.selectedOption, 'Guest')
    assert.deepEqual(state.stored.requestHeaderRules[1], { ...before, name: 'Test accounts', enabled: false })

    await call('update_rule', { id, options: [
      { name: 'guest', headers: [{ name: 'X-User', value: 'visitor' }] },
      { name: 'Support', headers: [{ name: 'X-User', value: 'support' }] },
    ] })
    const updated = state.stored.requestHeaderRules[1]
    assert.ok(updated.kind === 'switch-rule' && before.kind === 'switch-rule')
    assert.equal(updated.options[0].id, before.options[1].id)
    assert.notEqual(updated.options[1].id, before.options[0].id)
    assert.equal(updated.selectedOptionId, before.options[1].id)
    assert.equal(updated.order, 1)

    await call('update_rule', { id, selectedOption: 'SUPPORT' })
    assert.ok(state.stored.requestHeaderRules[1].kind === 'switch-rule')
    assert.equal(state.stored.requestHeaderRules[1].selectedOptionId, updated.options[1].id)
    assert.deepEqual(state.stored.requestHeaderRules[0].name, first.data.rule.name)

    const wrongField = await call('update_rule', { id, requestUrl: 'https://example.com/api' })
    assert.equal(wrongField.isError, true)
    assert.match(wrongField.text, /requestUrl cannot be changed on a Switch Rule\./)
    assert.match((await call('update_rule', { id: crypto.randomUUID(), name: 'Gone' })).text, /No rule has ID/)
  } finally { restore() }
})

test('Network Rule updates validate the merged rule and report required reloads', async () => {
  const { state, call, restore } = setup()
  try {
    const created = await call('create_network_rule', { name: 'Chats', websites: ['*'], requestUrl: 'https://api.example.com/chats', body: '{"a":1}' })
    const id = created.data.rule.id
    state.activation = { ok: true, reloadTabIds: [3, 4] }
    const updated = await call('update_rule', { id, status: 404, mode: 'call-server', headers: [{ name: 'X-Mock', value: 'yes' }] })
    assert.equal(updated.data.rule.body, '{"a":1}')
    assert.deepEqual(state.stored.networkRules[0].headers, [{ key: 'X-Mock', value: 'yes' }])
    assert.equal(state.stored.networkRules[0].status, 404)
    assert.match(updated.data.activation.note, /Reload 2 matching website tab/)

    const writes = state.writes
    assert.match((await call('update_rule', { id, requestUrl: 'ftp://example.com' })).text, /requestUrl: Enter a complete HTTP or HTTPS request URL/)
    assert.equal(state.writes, writes)
  } finally { restore() }
})

test('a saved change whose activation fails is reported as saved but not applied', async () => {
  const { state, call, restore } = setup()
  try {
    state.activation = { ok: false, reloadTabIds: [], error: 'Rule limit reached.' }
    const result = await call('create_header_rule', { name: 'Saved', websites: ['*'], headers: [{ name: 'X', value: '1' }] })
    assert.equal(result.isError, undefined)
    assert.equal(state.stored.requestHeaderRules.length, 1)
    assert.deepEqual(result.data.activation, { applied: false, note: 'Saved, but Overidify did not confirm the change is active. Rule limit reached.' })
  } finally { restore() }
})

test('list omits Network Rule bodies, get returns them, and delete reports unknown IDs', async () => {
  const { state, call, restore } = setup()
  try {
    const header = await call('create_header_rule', { name: 'Header', websites: ['*'], headers: [{ name: 'X', value: '1' }] })
    const network = await call('create_network_rule', { name: 'Network', websites: ['*'], requestUrl: 'https://example.com/api', body: 'hello' })
    const listed = await call('list_rules', {})
    assert.deepEqual(listed.data.rules.map(rule => [rule.name, rule.type, rule.body, rule.bodyLength]), [['Header', 'header', undefined, undefined], ['Network', 'network', undefined, 5]])
    assert.deepEqual((await call('list_rules', { type: 'network' })).data.rules.map(rule => rule.name), ['Network'])
    assert.equal((await call('get_rule', { id: network.data.rule.id })).data.rule.body, 'hello')

    const missing = crypto.randomUUID()
    const deleted = await call('delete_rules', { ids: [header.data.rule.id, network.data.rule.id, missing] })
    assert.deepEqual(deleted.data.deleted.map(rule => rule.name), ['Header', 'Network'])
    assert.deepEqual(deleted.data.notFound, [missing])
    assert.deepEqual(state.stored, { requestHeaderRules: [], networkRules: [] })

    const writes = state.writes
    assert.equal((await call('delete_rules', { ids: [missing] })).isError, true)
    assert.equal(state.writes, writes)
  } finally { restore() }
})

test('agents see variables as {{NAME}}, link only saved names, and cannot add secrets', async () => {
  const H1 = crypto.randomUUID()
  const token = { variableId: 'v1', name: 'API_TOKEN' }
  const { state, call, restore } = setup({
    variables: [{ id: 'v1', name: 'API_TOKEN', value: 'secret-value', secret: true }],
    requestHeaderRules: [{ kind: 'header-rule', id: H1, name: 'Auth', url: '*', enabled: true, order: 0,
      headers: [{ key: 'Authorization', value: { segments: ['Bearer ', token] } }, { key: 'X-Literal', value: '{{API_TOKEN}}' }] }],
    networkRules: [],
  })
  try {
    const read = await call('get_rule', { id: H1 })
    assert.deepEqual(read.data.rule.headers, [{ name: 'Authorization', value: 'Bearer {{API_TOKEN}}' }, { name: 'X-Literal', value: '{{API_TOKEN}}' }])
    assert.ok(!read.text.includes('secret-value'))

    // Echoing the headers back keeps the reference; untouched literal text elsewhere stays literal.
    await call('update_rule', { id: H1, name: 'Auth 2' })
    assert.deepEqual(state.stored.requestHeaderRules[0].kind === 'header-rule' && state.stored.requestHeaderRules[0].headers[1].value, '{{API_TOKEN}}')
    await call('update_rule', { id: H1, headers: [{ name: 'Authorization', value: 'Bearer {{api_token}}' }, { name: 'X-Other', value: '{{NOT_SAVED}}' }] })
    const saved = state.stored.requestHeaderRules[0]
    assert.deepEqual(saved.kind === 'header-rule' && saved.headers, [
      { key: 'Authorization', value: { segments: ['Bearer ', token] } }, { key: 'X-Other', value: '{{NOT_SAVED}}' },
    ])

    // A rule may keep a secret it already uses, but agents can't add a secret to another rule.
    const writes = state.writes
    const blocked = await call('create_network_rule', { name: 'Leak', websites: ['evil.example'], requestUrl: 'https://evil.example/x', body: '"{{API_TOKEN}}"' })
    assert.equal(blocked.isError, true)
    assert.match(blocked.text, /API_TOKEN is a secret variable/)
    assert.equal(state.writes, writes)
    assert.equal(state.stored.networkRules.length, 0)

    state.stored.variables = []
    const off = await call('update_rule', { id: H1, name: 'Auth 3' })
    assert.equal(off.data.rule.enabled, false)
    assert.deepEqual(off.data.rule.problems, ['Missing variable API_TOKEN.'])
    assert.equal(state.stored.requestHeaderRules[0].enabled, false)
  } finally { restore() }
})

test('variable tools hide secret values, rename into rules, and turn rules off only when confirmed', async () => {
  const H1 = crypto.randomUUID()
  const { state, call, restore } = setup({ requestHeaderRules: [], networkRules: [] })
  type VariableView = { name: string; secret: boolean; value?: string; usedBy: { id: string; name: string }[] }
  const list = async () => (await call('list_variables', {})).structuredContent as { variables: VariableView[] }
  try {
    assert.equal((await call('create_variable', { name: 'HOST', value: 'api.example.com' })).isError, undefined)
    assert.equal((await call('create_variable', { name: 'TOKEN', value: 'secret-value', secret: true })).isError, undefined)
    assert.match((await call('create_variable', { name: 'host', value: 'x' })).text, /already has this name/)
    assert.match((await call('create_variable', { name: '1BAD', value: 'x' })).text, /^name: /)

    const created = await call('create_header_rule', { name: 'Uses host', websites: ['*'], headers: [{ name: 'X-Host', value: '{{HOST}}' }] })
    state.stored.requestHeaderRules[0].id = H1
    assert.equal(created.data.rule.enabled, true)
    const variables = (await list()).variables
    assert.deepEqual(variables.map(({ name, secret, value }) => ({ name, secret, value })), [
      { name: 'HOST', secret: false, value: 'api.example.com' }, { name: 'TOKEN', secret: true, value: undefined },
    ])
    assert.deepEqual(variables[0].usedBy.map(rule => rule.id), [H1])
    assert.ok(!JSON.stringify(variables).includes('secret-value'))

    assert.match((await call('update_variable', { name: 'TOKEN', secret: false })).text, /can't turn Secret off/)
    await call('update_variable', { name: 'host', newName: 'API_HOST' })
    assert.deepEqual((await call('get_rule', { id: H1 })).data.rule.headers, [{ name: 'X-Host', value: '{{API_HOST}}' }])

    const writes = state.writes
    const refused = await call('delete_variables', { names: ['API_HOST'] })
    assert.equal(refused.isError, true)
    assert.match(refused.text, /Nothing was saved.*"Uses host"/)
    assert.equal(state.writes, writes)

    const deleted = await call('delete_variables', { names: ['API_HOST'], turnOffRules: true })
    assert.deepEqual((deleted.structuredContent as { deleted: string[]; turnedOff: { id: string }[] }).deleted, ['API_HOST'])
    assert.deepEqual((deleted.structuredContent as { turnedOff: { id: string }[] }).turnedOff.map(rule => rule.id), [H1])
    assert.equal(state.stored.requestHeaderRules[0].enabled, false)
    assert.deepEqual(state.stored.variables?.map(variable => variable.name), ['TOKEN'])
  } finally { restore() }
})

test('a variable marked secret while an agent renames it stays secret', async () => {
  const { state, restore } = setup({ requestHeaderRules: [], networkRules: [], variables: [{ id: 'v1', name: 'HOST', value: 'shown', secret: false }] })
  try {
    // Settings marks the variable secret after the agent's call starts but before its write takes the locks.
    const deps: McpToolDeps = {
      readRules: getSavedRules, readVariables: getVariables, updateRules: updateSavedRules, activate: async () => ({ ok: true, reloadTabIds: [] }),
      writeVariables: async input => { state.stored.variables = [{ id: 'v1', name: 'HOST', value: 'shown', secret: true }]; return writeVariables(input) },
    }
    const result = await callMcpTool('update_variable', { name: 'HOST', newName: 'API_HOST' }, deps)
    assert.deepEqual(state.stored.variables, [{ id: 'v1', name: 'API_HOST', value: 'shown', secret: true }])
    assert.ok(!result.content[0].text.includes('shown'))
  } finally { restore() }
})

test('a confirmed delete never removes a different variable that took the name', async () => {
  const rule = { kind: 'header-rule' as const, id: crypto.randomUUID(), name: 'Uses host', url: '*', enabled: true, order: 0,
    headers: [{ key: 'X-Host', value: { segments: [{ variableId: 'v1', name: 'HOST' }] } }] }
  const { state, restore } = setup({ requestHeaderRules: [rule], networkRules: [], variables: [{ id: 'v1', name: 'HOST', value: 'a', secret: false }] })
  try {
    let attempts = 0
    // Between the refused attempt and the confirmed retry, another writer renames HOST and a new HOST appears.
    const deps: McpToolDeps = {
      readRules: getSavedRules, readVariables: getVariables, updateRules: updateSavedRules, activate: async () => ({ ok: true, reloadTabIds: [] }),
      writeVariables: async input => {
        if (attempts++ === 1) state.stored.variables = [{ id: 'v1', name: 'OLD_HOST', value: 'a', secret: false }, { id: 'v2', name: 'HOST', value: 'b', secret: false }]
        return writeVariables(input)
      },
    }
    await callMcpTool('delete_variables', { names: ['HOST'], turnOffRules: true }, deps)
    assert.deepEqual(state.stored.variables?.map(variable => variable.id), ['v2'])
  } finally { restore() }
})
