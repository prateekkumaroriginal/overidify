import assert from 'node:assert/strict'
import { test } from 'node:test'
import { matchesPageDomain } from '../src/lib/pattern.ts'
import type { RequestHeaderRule } from '../src/lib/types.ts'

Object.assign(globalThis, {
  chrome: {
    declarativeNetRequest: {
      ResourceType: Object.fromEntries([
        'MAIN_FRAME', 'SUB_FRAME', 'STYLESHEET', 'SCRIPT', 'IMAGE', 'FONT',
        'OBJECT', 'XMLHTTPREQUEST', 'PING', 'CSP_REPORT', 'MEDIA', 'WEBSOCKET',
        'WEBBUNDLE', 'OTHER',
      ].map((type) => [type, type.toLowerCase()])),
    },
  },
})

const { requestHeaderRulesToSessionRules, syncRequestHeaderSessionRules } = await import('../src/lib/dnr.ts')

const localhostRule: RequestHeaderRule = {
  kind: 'header-rule', id: '00000000-0000-4000-8000-00000000000f', name: 'up50', url: 'localhost:4200', order: 0, enabled: true,
  headers: [
    { key: 'Origin', value: 'https://www.up50.co.in' },
    { key: 'Referer', value: 'https://www.up50.co.in/' },
  ],
}

test('localhost:4200 applies Origin and Referer to external API requests only in matching website tabs', () => {
  const [compiled] = requestHeaderRulesToSessionRules([localhostRule], [
    { id: 1, url: 'http://localhost:4200/messages' },
    { id: 2, url: 'http://localhost:4201/messages' },
    { id: 3, url: 'https://backendapi-qa.topfan.dev/' },
    { id: 4, url: 'http://localhost:4200/other' },
  ])
  assert.deepEqual(compiled.condition.tabIds, [1, 4])
  assert.equal(new RegExp(compiled.condition.regexFilter!).test(
    'https://backendapi-qa.topfan.dev/api/get-chatGroups-and-users?tab=featured&counts=true',
  ), true)
  assert.deepEqual(compiled.action.requestHeaders, [
    { header: 'Origin', operation: 'set', value: 'https://www.up50.co.in' },
    { header: 'Referer', operation: 'set', value: 'https://www.up50.co.in/' },
  ])
  assert.equal(compiled.condition.resourceTypes?.includes('main_frame' as chrome.declarativeNetRequest.ResourceType), false)
  assert.equal(compiled.condition.resourceTypes?.includes('sub_frame' as chrome.declarativeNetRequest.ResourceType), true)
})

test('disabled or empty rules and tabs without a supported page or ID cannot apply headers', () => {
  const tabs = [{ id: 1, url: 'http://localhost:4200/messages' }]
  assert.deepEqual(requestHeaderRulesToSessionRules([{ ...localhostRule, enabled: false }], tabs), [])
  assert.deepEqual(requestHeaderRulesToSessionRules([{ ...localhostRule, headers: [] }], tabs), [])
  assert.deepEqual(requestHeaderRulesToSessionRules([localhostRule], [
    { url: 'http://localhost:4200/messages' },
    { id: -1, url: 'http://localhost:4200/messages' },
    { id: 1 },
    { id: 2, url: 'chrome://extensions' },
  ]), [])
  assert.deepEqual(requestHeaderRulesToSessionRules([localhostRule], []), [])
})

test('ordered priorities and selected Switch Rule headers survive tab scoping', () => {
  const switchRule: RequestHeaderRule = {
    ...localhostRule, kind: 'switch-rule', id: '00000000-0000-4000-8000-000000000015', order: 1, selectedOptionId: '00000000-0000-4000-8000-000000000014',
    options: [
      { id: '00000000-0000-4000-8000-000000000018', name: 'Unused', headers: [{ key: 'Origin', value: 'https://unused.example.com' }] },
      { id: '00000000-0000-4000-8000-000000000014', name: 'Selected', headers: [{ key: 'Origin', value: 'https://selected.example.com' }] },
    ],
  }
  const compiled = requestHeaderRulesToSessionRules([switchRule, localhostRule], [{ id: 1, url: 'http://localhost:4200/messages' }])
  assert.ok(compiled[1].priority! > compiled[0].priority!)
  assert.deepEqual(compiled[1].action.requestHeaders, [
    { header: 'Origin', operation: 'set', value: 'https://selected.example.com' },
  ])
})

test('sync clears dynamic rules and removes page rules when the tab navigates away', async () => {
  const updates: { scope: string; options: chrome.declarativeNetRequest.UpdateRuleOptions }[] = []
  let sessionRules: chrome.declarativeNetRequest.Rule[] = [{ id: 901, action: {} as chrome.declarativeNetRequest.RuleAction, condition: {} }]
  let dynamicRules: chrome.declarativeNetRequest.Rule[] = [{ id: 900, action: {} as chrome.declarativeNetRequest.RuleAction, condition: {} }]
  Object.assign(chrome.declarativeNetRequest, {
    getDynamicRules: async () => dynamicRules,
    getSessionRules: async () => sessionRules,
    updateDynamicRules: async (options: chrome.declarativeNetRequest.UpdateRuleOptions) => {
      updates.push({ scope: 'dynamic', options })
      dynamicRules = []
    },
    updateSessionRules: async (options: chrome.declarativeNetRequest.UpdateRuleOptions) => {
      updates.push({ scope: 'session', options })
      sessionRules = options.addRules ?? []
    },
  })
  await syncRequestHeaderSessionRules([localhostRule], [{ id: 1, url: 'http://localhost:4200/messages' }])
  assert.deepEqual(updates[0], { scope: 'dynamic', options: { removeRuleIds: [900] } })
  assert.equal(updates[1].scope, 'session')
  assert.deepEqual(updates[1].options.removeRuleIds, [901])
  assert.equal(sessionRules.length, 1)
  assert.deepEqual(dynamicRules, [])
  updates.length = 0
  await syncRequestHeaderSessionRules([localhostRule], [{ id: 1, url: 'https://elsewhere.example.com/' }])
  assert.deepEqual(updates, [{ scope: 'session', options: { removeRuleIds: [1000], addRules: [] } }])
  assert.deepEqual(sessionRules, [])
})

test('Header Rules, Switch Rules, and popup match identical page domains regardless of API destination', () => {
  const cases = [
    {
      pattern: 'http://localhost:4200/messages',
      matches: ['http://localhost:4200/other', 'https://localhost:4200/api?x=1', 'ws://localhost:4200/socket', 'wss://localhost:4200/socket'],
      excludes: ['http://localhost:4201/messages', 'http://localhost:42000/messages', 'http://other.localhost:4200/messages', 'http://evil.com/?url=http://localhost:4200/messages'],
    },
    {
      pattern: 'api.example.com',
      matches: ['https://api.example.com/v1', 'http://api.example.com:8080/v2'],
      excludes: ['https://api.example.com.evil.com/v1', 'https://other.example.com/?host=api.example.com'],
    },
    {
      pattern: '*://*.example.com/messages',
      matches: ['https://api.example.com/other', 'http://nested.api.example.com:8080/other'],
      excludes: ['https://example.com/messages', 'https://evil.com/path/api.example.com/other'],
    },
    {
      pattern: 'http://[::1]:4200/messages',
      matches: ['https://[::1]:4200/other', 'ws://[::1]:4200/socket'],
      excludes: ['http://[::1]:4201/messages', 'http://[::2]:4200/messages'],
    },
    {
      pattern: '*',
      matches: ['https://example.com/any', 'http://localhost:4200/api', 'wss://example.com/socket'],
      excludes: ['file:///messages', 'chrome://extensions'],
    },
    ...['/messages', 'localhost:bad', 'not a host', 'user@example.com'].map((pattern) => ({
      pattern,
      matches: [],
      excludes: ['http://localhost:4200/messages', 'https://example.com/any'],
    })),
  ]

  for (const { pattern, matches, excludes } of cases) {
    const headers = [{ key: 'X-Test', value: 'same' }]
    const base = { name: 'Test', url: pattern, enabled: true }
    const entries: RequestHeaderRule[] = [
      { ...base, kind: 'header-rule', id: '00000000-0000-4000-8000-00000000000c', order: 0, headers },
      { ...base, kind: 'switch-rule', id: '00000000-0000-4000-8000-000000000015', order: 1, selectedOptionId: '00000000-0000-4000-8000-000000000003', options: [
        { id: '00000000-0000-4000-8000-000000000003', name: 'Active', headers },
      ] },
    ]
    const tabs = [...matches, ...excludes].map((url, id) => ({ id, url }))
    const compiled = requestHeaderRulesToSessionRules(entries, tabs)
    const matchedTabs = tabs.filter((tab) => matchesPageDomain(pattern, tab.url)).map((tab) => tab.id)
    assert.deepEqual(matchedTabs, tabs.filter((tab, index) => index < matches.length && /^https?:/.test(tab.url)).map((tab) => tab.id), pattern)
    assert.equal(compiled.length, matchedTabs.length ? 2 : 0)
    if (!compiled.length) continue
    assert.deepEqual(compiled[0].condition, compiled[1].condition, pattern)
    assert.deepEqual(compiled[0].action, compiled[1].action, pattern)
    for (const rule of compiled) {
      const regex = new RegExp(rule.condition.regexFilter!)
      assert.deepEqual(rule.condition.tabIds, matchedTabs)
      for (const url of matches.filter((url) => /^https?:/.test(url))) assert.equal(matchesPageDomain(pattern, url), true, url)
      for (const url of excludes) assert.equal(matchesPageDomain(pattern, url), false, url)
      assert.equal(regex.test('https://backendapi-qa.topfan.dev/api/get-chatGroups-and-users?tab=featured&counts=true'), true)
      assert.equal(regex.test('wss://external.example.com/socket'), true)
    }
  }
})
