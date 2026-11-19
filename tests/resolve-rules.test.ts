import assert from 'node:assert/strict'
import { test } from 'node:test'
import { matchesRuleWebsite, problemSummary, resolveRules, templateJsonWarning } from '../src/lib/resolve-rules.ts'
import { createNetworkRuleDraft, normalizeNetworkRules } from '../src/lib/network-rules.ts'
import type { NetworkRule } from '../src/lib/network-rules.ts'
import { normalizeRequestHeaderRules } from '../src/lib/request-header-rules.ts'
import { HeaderRuleDraftSchema, SwitchRuleDraftSchema } from '../src/lib/request-header-schemas.ts'
import { NetworkRuleDraftSchema } from '../src/lib/network-schemas.ts'
import type { HeaderRule, RequestHeaderRule, SwitchRule } from '../src/lib/types.ts'
import type { TemplateText } from '../src/lib/templates.ts'

const ref = (name: string) => ({ variable: name })
const tpl = (...parts: (string | { variable: string })[]): TemplateText => ({ template: parts })
const header = (patch: Partial<HeaderRule> = {}): HeaderRule => ({ kind: 'header-rule', id: '00000000-0000-4000-8000-000000000001', name: 'API auth',
  url: 'localhost:4200', enabled: true, order: 0, headers: [{ key: 'Authorization', value: tpl('Bearer ', ref('AUTH_TOKEN')) }], ...patch })
const network = (patch: Partial<NetworkRule> = {}): NetworkRule => ({ ...createNetworkRuleDraft(), id: '00000000-0000-4000-8000-000000000002', name: 'Mock',
  order: 0, url: 'localhost:4200', requestUrl: 'https://api.test/me', body: '{}', ...patch })
const resolve = (rules: { requestHeaderRules?: RequestHeaderRule[]; networkRules?: NetworkRule[] }, values: Record<string, string>) =>
  resolveRules({ requestHeaderRules: rules.requestHeaderRules ?? [], networkRules: rules.networkRules ?? [] }, new Map(Object.entries(values)))

test('a missing variable makes a rule inactive without changing enabled, and a recreated variable reactivates it', () => {
  const rule = header()
  const missing = resolve({ requestHeaderRules: [rule] }, {})
  const resolution = missing.byId.get(rule.id)!
  assert.equal(resolution.active, false)
  assert.equal(resolution.enabled, true)
  assert.equal(rule.enabled, true)
  assert.deepEqual(resolution.issues.map(issue => [issue.field, issue.message]), [['Header value', 'Missing variable AUTH_TOKEN']])
  assert.equal(problemSummary(resolution.issues), 'missing AUTH_TOKEN')
  assert.deepEqual(missing.requestHeaderRules, [])
  const active = resolve({ requestHeaderRules: [rule] }, { AUTH_TOKEN: 'abc123' })
  assert.deepEqual(active.requestHeaderRules[0].headers, [{ key: 'Authorization', value: 'Bearer abc123' }])
  assert.deepEqual(active.requestHeaderRules[0].execution.headers, rule.headers)
  const two = resolve({ requestHeaderRules: [header({ headers: [{ key: tpl(ref('B')), value: tpl(ref('A'), ref('B')) }] })] }, {})
  assert.deepEqual(two.byId.get(rule.id)!.issues.map(issue => issue.message), ['Missing variable B', 'Missing variables A, B'])
})

test('only the selected Switch option decides activation; unselected broken options are marked', () => {
  const options = [
    { id: '00000000-0000-4000-8000-000000000011', name: 'Production', headers: [{ key: 'X-Env', value: 'prod' }] },
    { id: '00000000-0000-4000-8000-000000000012', name: 'Staging', headers: [{ key: 'Authorization', value: tpl(ref('STAGING_TOKEN')) }] },
  ]
  const rule: SwitchRule = { kind: 'switch-rule', id: '00000000-0000-4000-8000-000000000010', name: 'Env', url: '*', enabled: true, order: 0, options, selectedOptionId: options[0].id }
  const production = resolve({ requestHeaderRules: [rule] }, {}).byId.get(rule.id)!
  assert.equal(production.active, true)
  assert.deepEqual(production.optionIssues[options[1].id].map(issue => issue.message), ['Missing variable STAGING_TOKEN'])
  const staging = resolve({ requestHeaderRules: [{ ...rule, selectedOptionId: options[1].id }] }, {})
  assert.equal(staging.byId.get(rule.id)!.active, false)
  assert.equal(problemSummary(staging.byId.get(rule.id)!.issues), 'missing STAGING_TOKEN')
  assert.deepEqual(staging.requestHeaderRules, [])
})

test('each resolved field is validated with its own requirement and messages never contain values', () => {
  const cases: [Partial<HeaderRule> | Partial<NetworkRule>, 'header' | 'network', Record<string, string>, string][] = [
    [{ name: tpl(ref('V')) }, 'header', { V: '   ' }, 'Name is empty after variables are filled in.'],
    [{ url: tpl(ref('V'), '.example.com') }, 'header', { V: 'bad host' }, 'Website domain is not valid after variables are filled in.'],
    [{ headers: [{ key: tpl('X-', ref('V')), value: 'ok' }] }, 'header', { V: 'bad name' }, 'Header name is not valid after variables are filled in.'],
    [{ headers: [{ key: 'X-Token', value: tpl(ref('V')) }] }, 'header', { V: '' }, 'Header value is empty or contains a line break after variables are filled in.'],
    [{ headers: [{ key: 'X-Token', value: tpl('a', ref('V')) }] }, 'header', { V: 'b\r\nInjected: yes' }, 'Header value is empty or contains a line break after variables are filled in.'],
    [{ headers: [{ key: 'X-Token', value: tpl('a', ref('V')) }] }, 'header', { V: 'b\0' }, 'Header value is empty or contains a line break after variables are filled in.'],
    [{ requestUrl: tpl(ref('V'), '/api') }, 'network', { V: 'ftp://host' }, 'Request URL is not a complete HTTP or HTTPS URL after variables are filled in.'],
    [{ headers: [{ key: tpl(ref('V')), value: 'token=1' }] }, 'network', { V: 'Set-Cookie' }, 'Mock headers cannot set browser cookies. Remove Set-Cookie after variables are filled in.'],
    [{ headers: [{ key: tpl(ref('V')), value: 'text/plain' }] }, 'network', { V: ' Content-Type ' }, 'Each response header needs a valid name and a value without line breaks after variables are filled in.'],
    [{ headers: [{ key: 'X-Mock', value: tpl(ref('V')) }] }, 'network', { V: 'a\nb' }, 'Each response header needs a valid name and a value without line breaks after variables are filled in.'],
  ]
  for (const [patch, kind, values, message] of cases) {
    const result = kind === 'header' ? resolve({ requestHeaderRules: [header({ headers: [{ key: 'X', value: 'y' }], ...patch as Partial<HeaderRule> })] }, values) : resolve({ networkRules: [network(patch as Partial<NetworkRule>)] }, values)
    const resolution = [...result.byId.values()][0]
    assert.equal(resolution.active, false, message)
    assert.deepEqual(resolution.issues.map(issue => issue.message), [message])
    assert.equal(result.requestHeaderRules.length + result.networkRules.length, 0)
    for (const value of Object.values(values).filter(value => value.trim().length > 2 && !message.includes(value))) assert.doesNotMatch(JSON.stringify(resolution), new RegExp(value.replace(/[^\w ]/g, '.')))
  }
})

test('an empty resolved header value is inactive, while an empty body and invalid JSON stay active', () => {
  assert.equal(resolve({ requestHeaderRules: [header({ headers: [{ key: 'X-Empty', value: tpl(ref('EMPTY')) }] })] }, { EMPTY: '' }).requestHeaderRules.length, 0)
  const empty = resolve({ networkRules: [network({ body: tpl(ref('EMPTY')) })] }, { EMPTY: '' })
  assert.equal(empty.networkRules[0].body, '')
  const body = tpl('{"token": ', ref('TOKEN'), '}')
  const invalidJson = resolve({ networkRules: [network({ body })] }, { TOKEN: 'abc' })
  assert.equal(invalidJson.networkRules[0].body, '{"token": abc}')
  const headers = [{ key: 'Content-Type', value: 'application/json' }]
  assert.equal(templateJsonWarning(body, headers, new Map([['TOKEN', 'abc']])), 'With current variable values, the body is not valid JSON. You can still save and return this text.')
  assert.equal(templateJsonWarning(body, headers, new Map([['TOKEN', '"abc"']])), null)
  assert.equal(templateJsonWarning(body, headers, new Map()), null)
  assert.equal(templateJsonWarning('{broken', headers, new Map()), null)
  // Resolved values are not trimmed.
  assert.equal(resolve({ requestHeaderRules: [header()] }, { AUTH_TOKEN: ' abc' }).requestHeaderRules[0].headers[0].value, 'Bearer  abc')
})

test('resolved domains use the shared matcher with case-insensitive hosts, and an unresolved domain matches no page', async () => {
  Object.assign(globalThis, { chrome: { declarativeNetRequest: { ResourceType: {} } } })
  const { requestHeaderRulesToSessionRules } = await import('../src/lib/dnr.ts')
  const url = tpl(ref('TENANT'), '.example.com')
  const rules = { requestHeaderRules: [header({ url, headers: [{ key: 'X-Tenant', value: 'yes' }] })], networkRules: [network({ url })] }
  const page = 'https://acme.example.com/app'
  const result = resolve(rules, { TENANT: 'Acme' })
  for (const resolution of result.byId.values()) {
    assert.deepEqual(resolution.domains, ['acme.example.com'])
    assert.equal(matchesRuleWebsite(resolution, page), true)
    assert.equal(matchesRuleWebsite(resolution, 'https://other.example.com/'), false)
  }
  assert.deepEqual(requestHeaderRulesToSessionRules(result.requestHeaderRules, [{ id: 7, url: page }])[0].condition.tabIds, [7])
  const broken = resolve(rules, { TENANT: 'bad host' })
  for (const resolution of broken.byId.values()) {
    assert.equal(resolution.domains, null)
    assert.equal(matchesRuleWebsite(resolution, page), false)
  }
  const missing = resolve(rules, {})
  assert.equal([...missing.byId.values()].every(resolution => resolution.domains === null && !matchesRuleWebsite(resolution, page)), true)
  // Literal domains keep today's normalization and matching exactly.
  assert.deepEqual(resolve({ requestHeaderRules: [header({ url: 'http://LOCALHOST:4200/x', headers: [{ key: 'X', value: 'y' }] })] }, {}).requestHeaderRules[0].url, 'http://LOCALHOST:4200/x')
})

test('Save checks are structural: references pass presence checks with missing variables, and literal fields keep current errors', () => {
  const draft = { name: tpl(ref('NAME')), url: [tpl(ref('TENANT'), '.example.com')], enabled: true, headers: [{ key: tpl(ref('KEY')), value: tpl(ref('VALUE')) }] }
  assert.equal(HeaderRuleDraftSchema.safeParse(draft).success, true)
  assert.equal(HeaderRuleDraftSchema.safeParse({ ...draft, url: ['bad host'] }).success, false)
  assert.equal(HeaderRuleDraftSchema.safeParse({ ...draft, headers: [{ key: tpl(ref('KEY')), value: '' }] }).success, false)
  assert.equal(HeaderRuleDraftSchema.safeParse({ ...draft, name: '  ' }).success, false)
  const option = { id: '00000000-0000-4000-8000-000000000021', name: tpl(ref('ENV'), ' admin'), headers: draft.headers }
  const twin = { ...option, id: '00000000-0000-4000-8000-000000000022', name: '{{ENV}} ADMIN' }
  assert.equal(SwitchRuleDraftSchema.safeParse({ ...draft, options: [option], selectedOptionId: option.id }).success, true)
  assert.equal(SwitchRuleDraftSchema.safeParse({ ...draft, options: [option, twin], selectedOptionId: option.id }).success, false)
  const networkDraft = { ...createNetworkRuleDraft(), name: 'Mock', url: '*', requestUrl: tpl('https://', ref('HOST'), '/api'), body: tpl(ref('BODY')),
    headers: [{ key: 'X-Value', value: tpl(ref('V')) }, { key: tpl(ref('K')), value: 'x' }] }
  assert.equal(NetworkRuleDraftSchema.safeParse(networkDraft).success, true)
  assert.equal(NetworkRuleDraftSchema.safeParse({ ...networkDraft, requestUrl: 'not a url' }).success, false)
  assert.equal(NetworkRuleDraftSchema.safeParse({ ...networkDraft, headers: [{ key: 'Set-Cookie', value: tpl(ref('V')) }] }).success, false)
  const [saved] = normalizeNetworkRules([{ ...networkDraft, id: '00000000-0000-4000-8000-000000000023', order: 0 }])
  assert.equal(saved.enabled, true)
  assert.equal(resolve({ networkRules: [saved] }, {}).byId.get(saved.id)!.active, false)
})

test('normalization keeps references case-sensitive, trims only outer edges, and turns invalid persisted references into literal text', () => {
  const [rule] = normalizeRequestHeaderRules([{ kind: 'header-rule', id: '00000000-0000-4000-8000-000000000031', name: { template: [' ', ref('ENV'), ' admin '] },
    url: [' {{X}}.Example.COM ', { template: [' ', ref('Tenant'), '.Example.com/path '] }], enabled: true,
    headers: [{ key: ' X-Token ', value: { template: [' Bearer ', ref('AUTH'), ' '] } }, { key: 'X-Bad', value: { template: [{ variable: 'BAD-NAME' }] } }] }])
  assert.deepEqual(rule.name, tpl(ref('ENV'), ' admin'))
  assert.deepEqual(rule.url, ['{{x}}.example.com', tpl(ref('Tenant'), '.Example.com/path')])
  assert.ok(rule.kind === 'header-rule')
  assert.deepEqual(rule.headers, [{ key: 'X-Token', value: tpl('Bearer ', ref('AUTH')) }, { key: 'X-Bad', value: '{{BAD-NAME}}' }])
})
