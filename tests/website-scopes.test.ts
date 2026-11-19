import assert from 'node:assert/strict'
import { test } from 'node:test'
import { matchesPageDomain, normalizeWebsiteScope, updateWebsiteScope } from '../src/lib/pattern.ts'
import { createHeaderRuleDraft, createSwitchRuleDraft, headerRuleToDraft, normalizeRequestHeaderRules, switchRuleToDraft } from '../src/lib/request-header-rules.ts'
import { createNetworkRuleDraft, networkRulesForPage, normalizeNetworkRules } from '../src/lib/network-rules.ts'
import { HeaderRuleDraftSchema, SwitchRuleDraftSchema } from '../src/lib/request-header-schemas.ts'
import { NetworkRuleDraftSchema } from '../src/lib/network-schemas.ts'
import { applyImport, exportRules, reviewImport } from '../src/lib/rule-transfer.ts'
import type { RuleCollection } from '../src/lib/rule-transfer.ts'

const domains = ['localhost:4200', '*.example.com', 'example.com']
const header = { ...createHeaderRuleDraft(), id: crypto.randomUUID(), kind: 'header-rule' as const, name: 'Test account', order: 0,
  url: domains, headers: [{ key: 'X-Test-User', value: 'alex' }] }
const option = { id: crypto.randomUUID(), name: 'Alex', headers: header.headers }
const switchRule = { ...createSwitchRuleDraft(), id: crypto.randomUUID(), kind: 'switch-rule' as const, name: 'Accounts', order: 1,
  url: domains, options: [option], selectedOptionId: option.id }
const network = { ...createNetworkRuleDraft(), id: crypto.randomUUID(), name: 'Profile', order: 0,
  url: domains, requestUrl: 'https://api.other.test/profile' }

test('domain edits reject cleared text without changing the active scope, while blank additions leave it unchanged', () => {
  const scope = ['app.example.com', 'staging.example.com']
  for (const input of ['', '  ']) {
    assert.throws(() => updateWebsiteScope(scope, input, 0), /Enter a domain or remove/)
    assert.deepEqual(updateWebsiteScope(scope, input, null), scope)
  }
  assert.deepEqual(scope, ['app.example.com', 'staging.example.com'])
  assert.deepEqual(updateWebsiteScope(scope, 'https://QA.EXAMPLE.COM/path', 0), ['qa.example.com', 'staging.example.com'])
  assert.throws(() => updateWebsiteScope(scope, 'https://staging.example.com/path', 0), /already in the list/)
  assert.throws(() => updateWebsiteScope(scope, 'bad host', 0), /Use a website domain/)
})

test('a domain list matches any member once, retaining wildcard, port and website-only boundaries', () => {
  for (const url of ['http://localhost:4200/path', 'https://deep.app.example.com:8080/path', 'https://example.com/']) {
    assert.equal(matchesPageDomain(domains, url), true, url)
  }
  for (const url of ['http://localhost:4201/', 'https://example.com.other.test/', 'https://api.other.test/profile', 'chrome://extensions/', 'wss://app.example.com/']) {
    assert.equal(matchesPageDomain(domains, url), false, url)
  }
  assert.equal(matchesPageDomain([], 'https://app.example.com/'), false)
  assert.equal(matchesPageDomain(['*'], 'https://any.test/'), true)
})

test('Header, Switch, Network and popup website eligibility agree for overlapping multi-domain scopes', async () => {
  Object.assign(globalThis, { chrome: { declarativeNetRequest: { ResourceType: {} } } })
  const { requestHeaderRulesToSessionRules } = await import('../src/lib/dnr.ts')
  const scope = ['app.example.com', '*.example.com', 'localhost:4200']
  const tabs = [
    { id: 1, url: 'https://app.example.com/' }, { id: 2, url: 'http://localhost:4200/page' },
    { id: 3, url: 'https://nested.example.com:8443/' }, { id: 4, url: 'https://example.com/' },
    { id: 5, url: network.requestUrl },
  ]
  const rules = [{ ...header, url: scope }, { ...switchRule, url: scope }]
  const compiled = requestHeaderRulesToSessionRules(rules, tabs)
  assert.equal(compiled.length, 2)
  assert.deepEqual(compiled.map(rule => rule.condition.tabIds), [[1, 2, 3], [1, 2, 3]])
  assert.ok(compiled[1].priority! > compiled[0].priority!)
  for (const tab of tabs) {
    const popupRules = rules.filter(rule => matchesPageDomain(rule.url, tab.url))
    assert.equal(popupRules.length, tab.id <= 3 ? 2 : 0)
    assert.equal(networkRulesForPage([{ ...network, url: scope }], tab.url).length, tab.id <= 3 ? 1 : 0)
  }
})

test('saved lists normalize every URL and duplicate without losing domain order, options or independent drafts', () => {
  const raw = [' http://LOCALHOST:4200/path ', '*://*.example.com/*', 'https://app.example.com/a', 'APP.EXAMPLE.COM']
  const expected = ['localhost:4200', '*.example.com', 'app.example.com']
  assert.deepEqual(normalizeWebsiteScope(raw), expected)
  const [savedHeader, savedSwitch] = normalizeRequestHeaderRules([{ ...header, url: raw }, { ...switchRule, url: raw }])
  const [savedNetwork] = normalizeNetworkRules([{ ...network, url: raw }])
  for (const rule of [savedHeader, savedSwitch, savedNetwork]) assert.deepEqual(rule.url, expected)
  assert.equal(savedNetwork.enabled, true)
  if (savedHeader.kind !== 'header-rule' || savedSwitch.kind !== 'switch-rule') throw Error('Wrong rule kind')
  const headerDraft = headerRuleToDraft(savedHeader), switchDraft = switchRuleToDraft(savedSwitch)
  assert.ok(Array.isArray(headerDraft.url) && Array.isArray(switchDraft.url))
  headerDraft.url[0] = 'changed.test'; switchDraft.url[0] = 'changed.test'
  assert.deepEqual(savedHeader.url, expected)
  assert.deepEqual(savedSwitch.url, expected)
  assert.equal(savedSwitch.selectedOptionId, option.id)
  assert.equal(normalizeWebsiteScope(['https://APP.EXAMPLE.COM/path']), 'app.example.com')
})

test('drafts reject empty lists and invalid members, and malformed stored lists never become all-websites rules', () => {
  for (const url of [[], ['app.example.com', 'bad host'], ['']]) {
    assert.equal(HeaderRuleDraftSchema.safeParse({ ...header, url }).success, false)
    assert.equal(SwitchRuleDraftSchema.safeParse({ ...switchRule, url }).success, false)
    assert.equal(NetworkRuleDraftSchema.safeParse({ ...network, url }).success, false)
  }
  for (const url of [[], ['app.example.com', 1]]) {
    const [saved] = normalizeRequestHeaderRules([{ ...header, url }])
    assert.equal(matchesPageDomain(saved.url, 'https://other.test/'), false)
    const [mock] = normalizeNetworkRules([{ ...network, url }])
    assert.equal(mock.enabled, false)
  }
})

test('multi-domain exports round-trip all rule types in version 2 while single-domain backups stay version 1', () => {
  const rules: RuleCollection = { requestHeaderRules: [header, switchRule], networkRules: [network] }
  const empty: RuleCollection = { requestHeaderRules: [], networkRules: [] }
  const text = exportRules(rules)
  assert.equal(JSON.parse(text).version, 2)
  const review = reviewImport(text, empty)
  assert.deepEqual(review.issues, [])
  assert.deepEqual(applyImport(empty, review, 'add'), rules)
  const single = { requestHeaderRules: [{ ...header, url: 'localhost:4200' }], networkRules: [] }
  assert.equal(JSON.parse(exportRules(single)).version, 1)
  assert.deepEqual(reviewImport(exportRules(single), empty).rules, single)
  const invalid = JSON.parse(text)
  invalid.networkRules[0].url = []
  const partial = reviewImport(JSON.stringify(invalid), empty)
  assert.equal(partial.issues.length, 1)
  assert.equal(partial.rules.requestHeaderRules.length, 2)
  assert.equal(partial.rules.networkRules.length, 0)
})
