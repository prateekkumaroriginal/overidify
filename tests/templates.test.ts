import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  canonicalTemplate, displayText, normalizePersistedTemplate, parseTemplateClipboard, rankVariableSuggestions, resolveTemplate,
  serializeTemplateClipboard, TEMPLATE_CLIPBOARD_TYPE, TemplateTextSchema, templatesEqual, trimTemplateEdges,
} from '../src/lib/templates.ts'

const auth = { template: ['Bearer ', { variable: 'AUTH_TOKEN' }] }

test('canonical templates merge text, drop empty parts, and collapse reference-free templates to literal strings', () => {
  assert.deepEqual(canonicalTemplate({ template: ['a', '', 'b', { variable: 'X' }, '', 'c', 'd'] }), { template: ['ab', { variable: 'X' }, 'cd'] })
  assert.equal(canonicalTemplate({ template: ['only ', 'text'] }), 'only text')
  assert.equal(canonicalTemplate({ template: [] }), '')
  assert.equal(templatesEqual({ template: ['Bear', 'er ', { variable: 'AUTH_TOKEN' }] }, auth), true)
  assert.equal(templatesEqual(auth, { template: ['Bearer ', { variable: 'auth_token' }] }), false)
  assert.equal(templatesEqual({ template: ['{{AUTH_TOKEN}}'] }, '{{AUTH_TOKEN}}'), true)
  assert.equal(templatesEqual('{{AUTH_TOKEN}}', { template: [{ variable: 'AUTH_TOKEN' }] }), false)
})

test('display text writes references as {{NAME}} and plain strings stay literal even when they read like references', () => {
  assert.equal(displayText(auth), 'Bearer {{AUTH_TOKEN}}')
  assert.deepEqual(resolveTemplate('{{AUTH_TOKEN}}', new Map([['AUTH_TOKEN', 'secret']])), { ok: true, value: '{{AUTH_TOKEN}}' })
  assert.equal(TemplateTextSchema.parse('{{AUTH_TOKEN}}'), '{{AUTH_TOKEN}}')
})

test('edge trimming touches only outer literal edges, never inner text or values filled in later', () => {
  assert.deepEqual(trimTemplateEdges({ template: ['  Bearer  ', { variable: 'T' }, '  tail  '] }), { template: ['Bearer  ', { variable: 'T' }, '  tail'] })
  assert.deepEqual(trimTemplateEdges({ template: [{ variable: 'T' }, ' '] }), { template: [{ variable: 'T' }] })
  const resolved = resolveTemplate(trimTemplateEdges({ template: ['Bearer ', { variable: 'T' }] }), new Map([['T', ' abc ']]))
  assert.deepEqual(resolved, { ok: true, value: 'Bearer  abc ' })
})

test('resolution is one literal pass that keeps values exactly and reports every missing name', () => {
  const values = new Map([['GREETING', 'Hi {{NAME}}'], ['NAME', 'never'], ['EMPTY', ''], ['MULTI', ' a\n b ']])
  assert.deepEqual(resolveTemplate({ template: ['{"msg":"', { variable: 'GREETING' }, '"}'] }, values), { ok: true, value: '{"msg":"Hi {{NAME}}"}' })
  assert.deepEqual(resolveTemplate({ template: [{ variable: 'EMPTY' }] }, values), { ok: true, value: '' })
  assert.deepEqual(resolveTemplate({ template: ['[', { variable: 'MULTI' }, ']'] }, values), { ok: true, value: '[ a\n b ]' })
  assert.deepEqual(resolveTemplate({ template: [{ variable: 'A' }, { variable: 'B' }, { variable: 'A' }] }, values), { ok: false, missing: ['A', 'B'] })
})

test('import parsing rejects invalid reference names, while persisted data repairs them as literal text', () => {
  for (const name of ['AUTH-TOKEN', '1ST', '', 'x'.repeat(65)]) {
    assert.equal(TemplateTextSchema.safeParse({ template: [{ variable: name }] }).success, false, name)
    assert.equal(normalizePersistedTemplate({ template: ['a', { variable: name }] }), `a{{${name}}}`)
  }
  assert.equal(TemplateTextSchema.safeParse({ template: [42] }).success, false)
  // Unknown keys such as a value are stripped, so imported references never carry values.
  assert.deepEqual(TemplateTextSchema.parse({ template: [{ variable: 'AUTH', value: 'sentinel-secret' }], value: 'sentinel-secret' }), { template: [{ variable: 'AUTH' }] })
  assert.equal(normalizePersistedTemplate(42, 'fallback'), 'fallback')
})

test('the private clipboard flavor round-trips references and rejects anything else', () => {
  const parts = ['Bearer ', { variable: 'AUTH_TOKEN' }]
  assert.equal(TEMPLATE_CLIPBOARD_TYPE, 'application/x-overidify-template+json')
  assert.deepEqual(parseTemplateClipboard(serializeTemplateClipboard(parts)), parts)
  for (const text of ['{{AUTH_TOKEN}}', '', null, '{"format":"other","version":1,"parts":[]}', '{"format":"overidify-template","version":2,"parts":[]}',
    '{"format":"overidify-template","version":1,"parts":[{"variable":"BAD-NAME"}]}']) {
    assert.equal(parseTemplateClipboard(text), null, String(text))
  }
})

test('suggestions rank an exact case-sensitive match, then prefixes, then substrings, ignoring a leading space', () => {
  const names = ['MY_TOKEN', 'token', 'TOKEN', 'TOKEN_B', 'ATOKEN', 'OTHER']
  assert.deepEqual(rankVariableSuggestions(names, 'TOKEN'), ['TOKEN', 'token', 'TOKEN_B', 'ATOKEN', 'MY_TOKEN'])
  assert.deepEqual(rankVariableSuggestions(names, '  tok'), ['TOKEN', 'token', 'TOKEN_B', 'ATOKEN', 'MY_TOKEN'])
  assert.deepEqual(rankVariableSuggestions(names, ''), ['ATOKEN', 'MY_TOKEN', 'OTHER', 'TOKEN', 'token', 'TOKEN_B'])
})
