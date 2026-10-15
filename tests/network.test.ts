import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createNetworkRuleDraft, jsonBodyWarning, matchesNetworkRequest, networkRulesForPage, normalizeNetworkRules, requestUrlKey, selectNetworkRule, validateNetworkRule } from '../src/lib/network-rules.ts'
import { matchesPageDomain } from '../src/lib/pattern.ts'
import type { NetworkRule } from '../src/lib/network-rules.ts'

function networkRule(patch: Partial<NetworkRule> = {}): NetworkRule {
  return { ...createNetworkRuleDraft(), id: 'chat', name: 'Chats', order: 0,
    requestUrl: 'https://backendapi-qa.topfan.dev/api/get-chatGroups-and-users?tab=featured&counts=true', ...patch }
}

test('exact request matching ignores query order but preserves parameters, values, path and method', () => {
  const entry = networkRule()
  assert.equal(matchesNetworkRequest(entry, 'https://backendapi-qa.topfan.dev/api/get-chatGroups-and-users?counts=true&tab=featured', 'GET'), true)
  for (const input of [entry.requestUrl + '&extra=1', entry.requestUrl.replace('featured', 'other'), entry.requestUrl.replace('/api/', '/API/'), entry.requestUrl.replace('https:', 'http:')]) {
    assert.equal(matchesNetworkRequest(entry, input, 'GET'), false, input)
  }
  assert.equal(matchesNetworkRequest(entry, entry.requestUrl, 'POST'), false)
  assert.equal(matchesNetworkRequest({ ...entry, method: 'ANY' }, entry.requestUrl, 'POST'), true)
})

test('request matching handles duplicates and URL encoding without conflating different query sets', () => {
  assert.equal(requestUrlKey('https://api.example/a?tag=b&tag=a&query=hello%20world'), requestUrlKey('https://API.example:443/a?query=hello+world&tag=a&tag=b#ignored'))
  assert.notEqual(requestUrlKey('https://api.example/a?tag=a&tag=a'), requestUrlKey('https://api.example/a?tag=a'))
  assert.notEqual(requestUrlKey('https://api.example/a?x=1&x=2'), requestUrlKey('https://api.example/a?x=1&y=2'))
  assert.notEqual(requestUrlKey('https://api.example/a?x=Ab'), requestUrlKey('https://api.example/a?x=ab'))
  assert.equal(requestUrlKey('ftp://api.example/a'), null)
  assert.equal(requestUrlKey('https://user:pass@api.example/a'), null)
})

test('website eligibility uses the same matcher as Header Rules and Switch Rules and never the API host', () => {
  for (const pattern of ['localhost:4200', '*.example.com', '*', 'http://localhost:4200/messages']) {
    const entry = networkRule({ url: pattern })
    for (const page of ['http://localhost:4200/messages', 'http://localhost:4201/', 'https://nested.example.com/', 'https://unmatched.test/']) {
      assert.equal(networkRulesForPage([entry], page).length > 0, matchesPageDomain(pattern, page))
    }
  }
  assert.equal(networkRulesForPage([networkRule({ url: 'localhost:4200' })], 'https://backendapi-qa.topfan.dev/').length, 0)
})

test('later enabled entries win and selection captures independent response settings', () => {
  const first = networkRule({ id: 'first', order: 0 })
  const second = networkRule({ id: 'second', order: 1, body: 'old', headers: [{ key: 'X-Test', value: 'old' }] })
  const disabled = networkRule({ id: 'disabled', order: 2, enabled: false })
  const selected = selectNetworkRule([disabled, second, first], first.requestUrl, 'GET')!
  assert.equal(selected.id, second.id)
  second.body = 'changed'
  second.headers[0].value = 'changed'
  assert.equal(selected.body, 'old')
  assert.equal(selected.headers[0].value, 'old')
  assert.equal(selectNetworkRule([first], '/no-match', 'GET', 'https://example.com'), undefined)
})

test('draft defaults and normalization preserve response text; invalid saved entries cannot intercept', () => {
  const draft = createNetworkRuleDraft()
  assert.equal(draft.method, 'GET')
  assert.equal(draft.mode, 'bypass')
  assert.equal(draft.status, 200)
  assert.equal(draft.enabled, true)
  const body = '  {broken json\n  '
  const [entry] = normalizeNetworkRules([networkRule({ url: 'http://LOCALHOST:4200/page', body, mode: 'call-server' })])
  assert.equal(entry.url, 'localhost:4200')
  assert.equal(entry.body, body)
  assert.equal(entry.mode, 'call-server')
  assert.equal(entry.enabled, true)
  assert.equal(normalizeNetworkRules([networkRule({ status: 0 })])[0].enabled, false)
  assert.equal(normalizeNetworkRules([networkRule({ requestUrl: 'not a URL' })])[0].enabled, false)
})

test('invalid JSON is a warning while impossible response headers and statuses block saving', () => {
  const entry = networkRule({ body: '{broken' })
  assert.equal(validateNetworkRule(entry), null)
  assert.ok(jsonBodyWarning(entry))
  assert.equal(jsonBodyWarning({ ...entry, headers: [{ key: 'content-type', value: 'text/plain' }] }), null)
  assert.equal(jsonBodyWarning({ ...entry, body: 'null' }), null)
  assert.ok(validateNetworkRule({ ...entry, status: 600 }))
  assert.ok(validateNetworkRule({ ...entry, headers: [{ key: 'X-Header', value: 'ok\r\nInjected: yes' }] }))
  assert.ok(validateNetworkRule({ ...entry, headers: [{ key: 'Set-Cookie', value: 'token=test' }] }))
  assert.equal(validateNetworkRule({ ...entry, headers: [{ key: 'X-Empty', value: '' }] }), null)
})
