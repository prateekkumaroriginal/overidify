import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { HeaderEntry } from '../src/lib/types.ts'

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

const { rulesToDynamicRules } = await import('../src/lib/dnr.ts')

test('rules and switchers compile identical domain conditions and match the same requests', () => {
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
    const entries: HeaderEntry[] = [
      { ...base, kind: 'rule', id: 'rule', order: 0, headers },
      { ...base, kind: 'switcher', id: 'switcher', order: 1, selectedOptionId: 'active', options: [
        { id: 'active', name: 'Active', headers },
      ] },
    ]
    const compiled = rulesToDynamicRules(entries)
    assert.equal(compiled.length, 2)
    assert.deepEqual(compiled[0].condition, compiled[1].condition, pattern)
    assert.deepEqual(compiled[0].action, compiled[1].action, pattern)
    for (const rule of compiled) {
      const regex = new RegExp(rule.condition.regexFilter!)
      for (const url of matches) assert.equal(regex.test(url), true, `${pattern} should match ${url}`)
      for (const url of excludes) assert.equal(regex.test(url), false, `${pattern} should exclude ${url}`)
    }
  }
})
