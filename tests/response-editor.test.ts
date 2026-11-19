import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyzeResponseBody, formatResponseBody } from '../src/lib/response-editor.ts'
import { confirmSuggestionSpec, insertPartsSpec, partsInRange, setKnownVariables, suggestionItems } from '../src/lib/template-editor-state.ts'

test('format availability rejects invalid JSON', () => {
  for (const body of ['{"id":', '[1,]', '/*comment*/1', '']) {
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

test('formatting preserves numeric spellings and duplicate keys without parsing and reserializing values', () => {
  assert.equal(formatResponseBody('{"count":1.0,"small":1e-3}'), '{\n  "count": 1.0,\n  "small": 1e-3\n}')
  assert.equal(formatResponseBody('{"a":9007199254740993,"a":-0,"small":0.10000000000000001,"large":1e400}'),
    '{\n  "a": 9007199254740993,\n  "a": -0,\n  "small": 0.10000000000000001,\n  "large": 1e400\n}')
})

test('formatting preserves escaped control characters in strings and property names', () => {
  const body = '{"text":"a\\nb\\r\\nc\\rd","a\\nb":123}'
  assert.equal(formatResponseBody(body), '{\n  "text": "a\\nb\\r\\nc\\rd",\n  "a\\nb": 123\n}')
})

test('an externally renamed reference survives undo of subsequent user changes', async () => {
  const { ResponseEditorSession } = await import('../src/lib/response-editor-session.ts')
  const editor = new ResponseEditorSession({ template: [{ variable: 'OLD' }] })
  editor.dispatch(editor.state.update({ changes: { from: editor.state.doc.length, insert: ' draft' }, userEvent: 'input.type' }))
  const renamed = { template: [{ variable: 'NEW' }, ' draft'] }
  editor.replaceFromOutside(renamed)
  assert.deepEqual(editor.template, renamed)
  assert.equal(editor.undo(), false)
  editor.dispatch(editor.state.update({ changes: { from: editor.state.doc.length, insert: ' new' }, userEvent: 'input.type' }))
  assert.equal(editor.undo(), true)
  assert.deepEqual(editor.template, renamed)
})

test('confirming a suggestion creates a reference while typed and pasted look-alikes stay literal', async () => {
  const { ResponseEditorSession } = await import('../src/lib/response-editor-session.ts')
  const editor = new ResponseEditorSession('Bearer ')
  editor.dispatch(editor.state.update({ effects: setKnownVariables.of(['AUTH', 'OTHER']) }))
  function type(insert: string) {
    const from = editor.state.doc.length
    editor.dispatch(editor.state.update({ changes: { from, insert }, selection: { anchor: from + insert.length }, userEvent: 'input.type' }))
  }
  type('{')
  type('{')
  type('AU')
  assert.deepEqual(suggestionItems(editor.state), ['AUTH'])
  const confirmation = confirmSuggestionSpec(editor.state, 'AUTH')
  assert.ok(confirmation)
  editor.dispatch(editor.state.update(confirmation))
  type(' {{AUTH}}')
  const end = editor.state.doc.length
  editor.dispatch(editor.state.update({ ...insertPartsSpec(end, end, [' {{AUTH}}'], false), userEvent: 'input.paste' }))
  assert.deepEqual(editor.template, { template: ['Bearer ', { variable: 'AUTH' }, ' {{AUTH}} {{AUTH}}'] })
})

test('a structured paste moves with surrounding edits and an atomic replacement can be undone and redone', async () => {
  const { ResponseEditorSession } = await import('../src/lib/response-editor-session.ts')
  const copied = new ResponseEditorSession({ template: [{ variable: 'AUTH' }] })
  const parts = partsInRange(copied.state, 0, copied.state.doc.length)
  const editor = new ResponseEditorSession('left right')
  editor.dispatch(editor.state.update({ ...insertPartsSpec(5, 5, [...parts, ' '], false), userEvent: 'input.paste' }))
  editor.dispatch(editor.state.update({ changes: { from: 0, insert: 'far ' }, userEvent: 'input.type' }))
  const withReference = { template: ['far left ', { variable: 'AUTH' }, ' right'] }
  assert.deepEqual(editor.template, withReference)
  const from = editor.body.indexOf('AUTH')
  editor.dispatch(editor.state.update({ changes: { from, to: from + 4, insert: 'masked' }, userEvent: 'input.replace' }))
  assert.equal(editor.template, 'far left masked right')
  assert.equal(editor.undo(), true)
  assert.deepEqual(editor.template, withReference)
  assert.equal(editor.redo(), true)
  assert.equal(editor.template, 'far left masked right')
})
