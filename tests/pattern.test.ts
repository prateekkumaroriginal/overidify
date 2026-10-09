import assert from 'node:assert/strict'
import { test } from 'node:test'
import { domainPatternToRegexFilter, getDomainPattern, isValidDomainPattern, patternToRegexFilter } from '../src/lib/pattern.ts'

test('switcher domains ignore schemes, paths, queries, and fragments', () => {
  for (const input of ['localhost:4200', 'http://localhost:4200/messages', 'https://LOCALHOST:4200/other?test=1#tab']) {
    assert.equal(getDomainPattern(input), 'localhost:4200')
    const matches = new RegExp(domainPatternToRegexFilter(input))
    for (const url of ['http://localhost:4200/messages', 'http://localhost:4200/api/messages?test=1', 'https://localhost:4200/other', 'ws://localhost:4200/socket']) {
      assert.equal(matches.test(url), true, `${input} should match ${url}`)
    }
    for (const url of ['http://localhost:4201/messages', 'http://localhost:42000/messages', 'http://localhost:4200.evil.example/messages', 'http://other.localhost:4200/messages', 'http://example.com/?url=http://localhost:4200/messages']) {
      assert.equal(matches.test(url), false, `${input} should exclude ${url}`)
    }
  }
})

test('domains without a port match the exact host across ports', () => {
  const matches = new RegExp(domainPatternToRegexFilter('api.example.com'))
  assert.equal(matches.test('https://api.example.com/v1'), true)
  assert.equal(matches.test('http://api.example.com:8080/v2'), true)
  assert.equal(matches.test('https://api.example.com.evil.com/v1'), false)
  assert.equal(matches.test('https://other.example.com/?host=api.example.com'), false)
})

test('domain wildcards stay within the hostname', () => {
  const matches = new RegExp(domainPatternToRegexFilter('*://*.example.com/messages'))
  assert.equal(matches.test('https://api.example.com/other'), true)
  assert.equal(matches.test('https://nested.api.example.com:8080/other'), true)
  assert.equal(matches.test('https://evil.com/path/api.example.com/other'), false)
  assert.equal(matches.test('https://evil.com/?host=api.example.com'), false)
  assert.equal(new RegExp(domainPatternToRegexFilter('*')).test('http://localhost:4200/any'), true)
})

test('invalid domains cannot produce a rule matching every request', () => {
  for (const input of ['', 'http://', '/messages', 'not a host', 'user@example.com', 'localhost:bad', 'localhost:99999', 'localhost:']) {
    assert.equal(isValidDomainPattern(input), false, input)
    assert.equal(new RegExp(domainPatternToRegexFilter(input)).test('http://localhost:4200/messages'), false, input)
  }
  assert.equal(isValidDomainPattern('http://[::1]:4200/messages'), true)
  assert.equal(new RegExp(domainPatternToRegexFilter('[::1]:4200')).test('http://[::1]:4200/api'), true)
})

test('ordinary rules retain their full URL pattern matching', () => {
  const matches = new RegExp(patternToRegexFilter('http://localhost:4200/messages'))
  assert.equal(matches.test('http://localhost:4200/messages'), true)
  assert.equal(matches.test('http://localhost:4200/other'), false)
  assert.equal(matches.test('https://localhost:4200/messages'), false)
})
