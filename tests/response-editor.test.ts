import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyzeResponseBody, formatResponseBody } from '../src/lib/response-editor.ts'

test('format availability rejects invalid or lossy JSON', () => {
  for (const body of ['{"id":', '{"id":1,"id":2}', '{"id":9007199254740993}', '1e400', '0.10000000000000001', '-0', '{"id":1,"\\u0069d":2}', '[1,]', '/*comment*/1', '']) {
    const result = analyzeResponseBody(body)
    assert.equal(result.available, false, body)
    assert.ok(result.reason, body)
  }
  for (const body of ['null', 'true', '"hello"', '[1,2]', '{"count":1.0,"ratio":1e-3}', '{"a":1,"nested":{"a":2}}']) {
    assert.equal(analyzeResponseBody(body).available, true, body)
  }
})

test('text edits and Format share undo history and failed formatting preserves text', async () => {
  const { ResponseEditorSession } = await import('../src/lib/response-editor-session.ts')
  const original = ' {\r\n "a": 1.0\r\n} '
  const editor = new ResponseEditorSession(original)
  assert.equal(editor.body, original)
  editor.format()
  const formatted = editor.body
  const from = editor.body.indexOf('1.0')
  editor.dispatch(editor.state.update({ changes: { from, to: from + 3, insert: '2' } }))
  assert.deepEqual(JSON.parse(editor.body), { a: 2 })
  editor.undo()
  assert.equal(editor.body, formatted)
  editor.undo()
  assert.equal(editor.body, original)
  editor.redo()
  assert.equal(editor.body, formatted)
  editor.replace(' { broken\n ')
  assert.throws(() => editor.format(), /valid JSON/)
  assert.equal(editor.body, ' { broken\n ')
  editor.undo()
  assert.equal(editor.body, formatted)
})

test('large and deeply nested bodies remain intact when formatting is restricted', async () => {
  const { ResponseEditorSession } = await import('../src/lib/response-editor-session.ts')
  for (const body of ['"' + 'x'.repeat(1_000_001) + '"', '['.repeat(101) + '0' + ']'.repeat(101)]) {
    const editor = new ResponseEditorSession(body)
    assert.equal(analyzeResponseBody(editor.body).available, false)
    assert.throws(() => editor.format(), /unavailable/)
    assert.equal(editor.body, body)
  }
})

test('formatting preserves numeric data and unsafe input cannot replace the current document', () => {
  assert.equal(formatResponseBody('{"count":1.0,"small":1e-3}'), '{\n  "count": 1.0,\n  "small": 1e-3\n}')
  for (const body of ['{"a":1,"a":2}', '{"n":9007199254740993}', '{"a":']) {
    assert.throws(() => formatResponseBody(body))
  }
})

test('formatting preserves escaped control characters in strings and property names', () => {
  const body = '{"text":"a\\nb\\r\\nc\\rd","a\\nb":123}'
  assert.equal(formatResponseBody(body), '{\n  "text": "a\\nb\\r\\nc\\rd",\n  "a\\nb": 123\n}')
})
