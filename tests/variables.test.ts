import assert from 'node:assert/strict'
import { test } from 'node:test'
import { countFieldUsage, indexVariables, normalizeVariables, resolveTemplate } from '../src/lib/variables.ts'
import type { Variable } from '../src/lib/variables.ts'
import { prepareRulesForSave, resolveRules, ruleTemplateFields } from '../src/lib/rule-resolution.ts'
import { planVariablesSave } from '../src/lib/variables-save.ts'
import { createNetworkRuleDraft, normalizeNetworkRules } from '../src/lib/network-rules.ts'
import type { NetworkRule } from '../src/lib/network-rules.ts'
import { normalizeRequestHeaderRules } from '../src/lib/request-header-rules.ts'
import { HeaderRuleDraftSchema, SwitchRuleDraftSchema } from '../src/lib/request-header-schemas.ts'
import { NetworkRuleDraftSchema } from '../src/lib/network-schemas.ts'
import type { HeaderRule, RequestHeaderRule, SwitchRule } from '../src/lib/types.ts'
import type { TemplateText, VariableToken } from '../src/lib/templates.ts'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const variable = (n: number, name: string, value = `value-${n}`, secret = false): Variable => ({ id: id(n), name, value, secret })
const token = (n: number, name: string): VariableToken => ({ variableId: id(n), name })
const tpl = (...segments: (string | VariableToken)[]): TemplateText => ({ segments })
const AUTH = variable(1, 'STAGE_AUTH_TOKEN', 'sentinel-secret-7f3', true)
const HOST = variable(2, 'STAGE_API_HOST', 'api.stage.acme.dev')

const headerRule = (patch: Partial<HeaderRule> = {}): HeaderRule => ({ kind: 'header-rule', id: id(101), name: 'Stage API', url: tpl(token(2, 'STAGE_API_HOST')),
  enabled: true, order: 0, headers: [{ key: 'Authorization', value: tpl('Bearer ', token(1, 'STAGE_AUTH_TOKEN')) }, { key: 'X-Literal', value: '{{STAGE_AUTH_TOKEN}}' }], ...patch })
const networkRule = (patch: Partial<NetworkRule> = {}): NetworkRule => ({ ...createNetworkRuleDraft(), id: id(103), name: 'Me', order: 0, url: 'localhost:4200',
  requestUrl: tpl('https://', token(2, 'STAGE_API_HOST'), '/me'), body: tpl('{"token":"', token(1, 'STAGE_AUTH_TOKEN'), '"}'), ...patch })

test('a picked variable resolves; typed {{NAME}} text and values that read like templates stay literal', () => {
  const index = indexVariables([AUTH, variable(3, 'GREETING', 'Hi {{STAGE_AUTH_TOKEN}}')])
  assert.deepEqual(resolveTemplate('{{STAGE_AUTH_TOKEN}}', index), { ok: true, value: '{{STAGE_AUTH_TOKEN}}' })
  assert.deepEqual(resolveTemplate(tpl('<', token(3, 'GREETING'), '>'), index), { ok: true, value: '<Hi {{STAGE_AUTH_TOKEN}}>' })
  assert.deepEqual(resolveTemplate(tpl(token(9, 'GONE'), token(8, 'ALSO_GONE')), index), { ok: false, missing: ['GONE', 'ALSO_GONE'] })
  const resolved = resolveRules({ requestHeaderRules: [headerRule()], networkRules: [] }, [AUTH, HOST])
  assert.deepEqual(resolved.requestHeaderRules[0].headers, [
    { key: 'Authorization', value: 'Bearer sentinel-secret-7f3' }, { key: 'X-Literal', value: '{{STAGE_AUTH_TOKEN}}' },
  ])
  assert.deepEqual(resolved.requestHeaderRules[0].url, 'api.stage.acme.dev')
})

test('tokens follow their variable through renames, and a recreated name repairs a deleted one', () => {
  const renamed = [{ ...AUTH, name: 'AUTH' }, HOST]
  assert.equal(resolveRules({ requestHeaderRules: [headerRule()], networkRules: [] }, renamed).requestHeaderRules.length, 1)
  const recreated = [variable(7, 'stage_auth_token', 'again'), HOST]
  const resolved = resolveRules({ requestHeaderRules: [headerRule()], networkRules: [] }, recreated)
  assert.equal(resolved.requestHeaderRules[0].headers[0].value, 'Bearer again')
})

test('website eligibility uses filled-in domains, and a domain that cannot be filled in matches no page', () => {
  const resolved = resolveRules({ requestHeaderRules: [headerRule()], networkRules: [networkRule({ url: tpl(token(2, 'STAGE_API_HOST')) })] }, [AUTH, HOST])
  assert.deepEqual(resolved.checks.get(id(101))?.domains, ['api.stage.acme.dev'])
  const badHost = resolveRules({ requestHeaderRules: [headerRule()], networkRules: [] }, [AUTH, { ...HOST, value: 'not a host' }])
  assert.equal(badHost.checks.get(id(101))?.domains, null)
  assert.deepEqual(badHost.checks.get(id(101))?.problems.map(problem => problem.message), ['Website domain is not valid after variables are filled in.'])
  assert.equal(badHost.requestHeaderRules.length, 0)
})

test('problems name variables and fields, never values, and only the selected Switch option counts', () => {
  const check = resolveRules({ requestHeaderRules: [headerRule()], networkRules: [networkRule()] }, [HOST]).checks
  assert.deepEqual(check.get(id(101))?.problems, [{ field: 'Header value', path: ['headers', 0, 'value'], message: 'Missing variable STAGE_AUTH_TOKEN.' }])
  assert.deepEqual(check.get(id(103))?.problems.map(problem => problem.field), ['Response body'])
  const lineBreak = resolveRules({ requestHeaderRules: [headerRule()], networkRules: [] }, [{ ...AUTH, value: 'a\nb' }, HOST]).checks.get(id(101))
  assert.deepEqual(lineBreak?.problems.map(problem => problem.message), ['Header value is not valid after variables are filled in.'])
  assert.doesNotMatch(JSON.stringify(lineBreak), /a\\nb/)

  const switchRule: SwitchRule = { kind: 'switch-rule', id: id(102), name: 'Env', url: '*', enabled: true, order: 1, selectedOptionId: id(201), options: [
    { id: id(201), name: 'Production', headers: [{ key: 'X-Env', value: 'prod' }] },
    { id: id(202), name: 'Staging', headers: [{ key: 'X-Token', value: tpl(token(1, 'STAGE_AUTH_TOKEN')) }] },
  ] }
  const selectedOk = resolveRules({ requestHeaderRules: [switchRule], networkRules: [] }, [])
  assert.equal(selectedOk.requestHeaderRules.length, 1)
  assert.equal(selectedOk.checks.get(id(102))?.optionProblems[id(202)].length, 1)
  const selectedBroken = resolveRules({ requestHeaderRules: [{ ...switchRule, selectedOptionId: id(202) }], networkRules: [] }, [])
  assert.equal(selectedBroken.requestHeaderRules.length, 0)
})

test('every rule write turns off rules that cannot run, never turns one on, and keeps token names current', () => {
  const rules = [headerRule(), headerRule({ id: id(104), enabled: false })]
  const missing = prepareRulesForSave(rules, [HOST])
  assert.deepEqual(missing.rules.map(rule => rule.enabled), [false, false])
  assert.deepEqual(missing.turnedOff.map(rule => rule.id), [id(101)])
  // Fixing the variable later does not turn the rule back on.
  assert.deepEqual(prepareRulesForSave(missing.rules, [AUTH, HOST]).rules.map(rule => rule.enabled), [false, false])

  const renamed = prepareRulesForSave([headerRule()], [{ ...AUTH, name: 'AUTH_TOKEN' }, HOST])
  assert.deepEqual(renamed.turnedOff, [])
  assert.deepEqual((renamed.rules[0] as HeaderRule).headers[0].value, tpl('Bearer ', token(1, 'AUTH_TOKEN')))
  const relinked = prepareRulesForSave([headerRule()], [variable(7, 'STAGE_AUTH_TOKEN'), HOST])
  assert.deepEqual((relinked.rules[0] as HeaderRule).headers[0].value, tpl('Bearer ', token(7, 'STAGE_AUTH_TOKEN')))
})

test('Variables page saves apply the draft by ID, reject duplicate names ignoring case, and turn off rules left unable to run', () => {
  const rules = { requestHeaderRules: [headerRule()] as RequestHeaderRule[], networkRules: [networkRule()] }
  const baseline = [AUTH, HOST]
  // Another window changed STAGE_API_HOST and added OTHER after this page loaded.
  const stored = [AUTH, { ...HOST, value: 'api.other.dev' }, variable(5, 'OTHER')]
  const secretOnly = planVariablesSave({ stored, baseline, draft: [{ ...AUTH, secret: false }, HOST], rules })
  assert.ok(secretOnly.ok)
  assert.deepEqual(secretOnly.variables.map(row => [row.name, row.value, row.secret]), [
    ['STAGE_AUTH_TOKEN', 'sentinel-secret-7f3', false], ['STAGE_API_HOST', 'api.other.dev', false], ['OTHER', 'value-5', false],
  ])
  assert.deepEqual(secretOnly.turnedOff, [])

  assert.deepEqual(planVariablesSave({ stored, baseline, draft: [AUTH, HOST, variable(6, 'other')], rules }),
    { ok: false, errors: { [id(6)]: 'Another variable already has this name.' } })

  const deleted = planVariablesSave({ stored: baseline, baseline, draft: [HOST], rules })
  assert.ok(deleted.ok)
  assert.deepEqual(deleted.turnedOff, [{ id: id(101), name: 'Stage API', type: 'header-rule' }, { id: id(103), name: 'Me', type: 'network-rule' }])
  assert.equal(deleted.headerChanged && deleted.networkChanged, true)
  assert.deepEqual([...deleted.rules.requestHeaderRules, ...deleted.rules.networkRules].map(rule => rule.enabled), [false, false])
})

test('Usage counts each rule field once, including disabled rules', () => {
  const fields = [headerRule(), headerRule({ id: id(104), enabled: false }), networkRule()].flatMap(ruleTemplateFields)
  const usage = countFieldUsage([...fields, tpl(token(1, 'STAGE_AUTH_TOKEN'), token(1, 'STAGE_AUTH_TOKEN'))], [AUTH, HOST])
  assert.deepEqual(Object.fromEntries(usage), { [id(1)]: 4, [id(2)]: 3 })
})

test('saved rules keep tokens, literal-only fields keep their checks, and drafts accept fields that need variables', () => {
  const [saved] = normalizeRequestHeaderRules([{ ...headerRule(), headers: [{ key: ' X-Token ', value: { segments: ['  Bearer ', token(1, 'STAGE_AUTH_TOKEN'), ' '] } },
    { key: 'X-Bad', value: { segments: [{ variableId: 'x', name: 'bad name' }] } }] }])
  assert.deepEqual((saved as HeaderRule).headers, [{ key: 'X-Token', value: tpl('Bearer ', token(1, 'STAGE_AUTH_TOKEN')) }, { key: 'X-Bad', value: '{{bad name}}' }])
  assert.deepEqual(saved.url, tpl(token(2, 'STAGE_API_HOST')))
  const [network] = normalizeNetworkRules([networkRule()])
  assert.deepEqual(network.requestUrl, tpl('https://', token(2, 'STAGE_API_HOST'), '/me'))
  assert.equal(network.enabled, true)

  assert.equal(HeaderRuleDraftSchema.safeParse(headerRule()).success, true)
  assert.equal(HeaderRuleDraftSchema.safeParse({ ...headerRule(), url: 'not a host' }).success, false)
  assert.equal(SwitchRuleDraftSchema.safeParse({ ...headerRule(), selectedOptionId: id(1), options: [{ id: id(1), name: 'A', headers: [{ key: '', value: tpl(token(1, 'X')) }] }] }).success, false)
  assert.equal(NetworkRuleDraftSchema.safeParse(networkRule()).success, true)
  assert.equal(NetworkRuleDraftSchema.safeParse(networkRule({ requestUrl: 'not a url' })).success, false)
  assert.deepEqual(normalizeVariables([{ id: 'a', name: 'A', value: '', secret: 'yes' }, { id: 'b', name: 'a', value: 'x' }, { id: 'c', name: '9X', value: '' }]),
    [{ id: 'a', name: 'A', value: '', secret: false }])
})
