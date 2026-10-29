import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyzeResponseBody, formatResponseBody } from '../src/lib/response-editor.ts'

test('structured editing rejects invalid or lossy JSON without changing the body', () => {
  for (const body of ['{"id":', '{"id":1,"id":2}', '{"id":9007199254740993}', '1e400', '0.10000000000000001', '-0', '{"id":1,"\\u0069d":2}', '[1,]', '/*comment*/1', '']) {
    const result = analyzeResponseBody(body)
    assert.equal(result.available, false, body)
    assert.ok(result.reason, body)
  }
  for (const body of ['null', 'true', '"hello"', '[1,2]', '{"count":1.0,"ratio":1e-3}', '{"a":1,"nested":{"a":2}}']) {
    assert.equal(analyzeResponseBody(body).available, true, body)
  }
})

test('tree edits change structure and types without changing unrelated data', async () => {
  const { editResponseTree } = await import('../src/lib/response-editor.ts')
  let body = '{"users":[{"name":"Ada"},{"name":"Bo"}],"__proto__":{"safe":true}}'
  body = editResponseTree(body, { type: 'rename', path: ['users', 0, 'name'], key: 'displayName' })
  body = editResponseTree(body, { type: 'add', path: ['users'], value: '{"name":"Cy"}' })
  body = editResponseTree(body, { type: 'move', path: ['users', 2], to: 0 })
  body = editResponseTree(body, { type: 'remove', path: ['users', 2] })
  body = editResponseTree(body, { type: 'replace', path: ['users', 1, 'displayName'], value: 'false' })
  assert.deepEqual(JSON.parse(body), { users: [{ name: 'Cy' }, { displayName: false }], ['__proto__']: { safe: true } })
  assert.equal(editResponseTree(body, { type: 'replace', path: [], value: 'null' }), 'null')
  assert.throws(() => editResponseTree('{"a":1,"b":2}', { type: 'rename', path: ['a'], key: 'b' }), /already exists/)
  assert.throws(() => editResponseTree(body, { type: 'replace', path: ['missing'], value: '0' }), /no longer exists/)
  assert.throws(() => editResponseTree(body, { type: 'replace', path: [], value: '9007199254740993' }), /faithfully/)
})

test('Code, Tree and Format share undo history and failed operations preserve text', async () => {
  const { ResponseEditorSession } = await import('../src/lib/response-editor-session.ts')
  const original = ' {\r\n "a": 1.0\r\n} '
  const editor = new ResponseEditorSession(original)
  assert.equal(editor.body, original)
  editor.format()
  const formatted = editor.body
  editor.editTree({ type: 'replace', path: ['a'], value: '2' })
  assert.deepEqual(JSON.parse(editor.body), { a: 2 })
  editor.undo()
  assert.equal(editor.body, formatted)
  editor.undo()
  assert.equal(editor.body, original)
  editor.redo()
  assert.equal(editor.body, formatted)
  editor.replace(' { broken\n ')
  assert.throws(() => editor.format(), /valid JSON/)
  assert.throws(() => editor.editTree({ type: 'replace', path: [], value: '0' }), /valid JSON/)
  assert.equal(editor.body, ' { broken\n ')
  editor.undo()
  assert.equal(editor.body, formatted)
})

test('large and deeply nested bodies remain intact when structured features are restricted', async () => {
  const { ResponseEditorSession } = await import('../src/lib/response-editor-session.ts')
  for (const body of ['"' + 'x'.repeat(1_000_001) + '"', '['.repeat(101) + '0' + ']'.repeat(101)]) {
    const editor = new ResponseEditorSession(body)
    assert.equal(analyzeResponseBody(editor.body).available, false)
    assert.throws(() => editor.format(), /unavailable/)
    assert.equal(editor.body, body)
  }
})

test('mode preference survives sessions and falls back safely when unavailable or storage fails', async () => {
  const { readResponseEditorMode, saveResponseEditorMode } = await import('../src/lib/response-editor-preference.ts')
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
  saveResponseEditorMode(storage, 'tree')
  assert.equal(readResponseEditorMode(storage, true), 'tree')
  assert.equal(readResponseEditorMode(storage, false), 'code')
  assert.equal(readResponseEditorMode(storage, true), 'tree')
  const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('full') } }
  assert.equal(readResponseEditorMode(broken, true), 'code')
  assert.doesNotThrow(() => saveResponseEditorMode(broken, 'tree'))
})


test('formatting preserves numeric data and unsafe input cannot replace the current document', () => {
  assert.equal(formatResponseBody('{"count":1.0,"small":1e-3}'), '{\n  "count": 1.0,\n  "small": 1e-3\n}')
  for (const body of ['{"a":1,"a":2}', '{"n":9007199254740993}', '{"a":']) {
    assert.throws(() => formatResponseBody(body))
  }
})


test('Tree preserves control characters in strings and keys during unrelated edits', async () => {
  const { editResponseTree } = await import('../src/lib/response-editor.ts')
  const body = '{"text":"a\\nb\\r\\nc\\rd","a\\nb":123}'
  const edited = editResponseTree(body, { type: 'rename', path: ['a\nb'], key: 'a\rb' })
  assert.deepEqual(JSON.parse(edited), { text: 'a\nb\r\nc\rd', ['a\rb']: 123 })
  const replaced = editResponseTree(edited, { type: 'replace', path: ['text'], value: '"new\\r\\ntext"' })
  assert.deepEqual(JSON.parse(replaced), { text: 'new\r\ntext', ['a\rb']: 123 })
})
