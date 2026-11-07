import test from 'node:test'
import assert from 'node:assert/strict'
import { capturedCodeLines, decorateCapturedCode, findCapturedText, highlightCapturedJson, previewCapturedCode } from '../src/lib/captured-code.ts'

test('captured JSON highlighting preserves exact text, repeated keys and numeric spellings', () => {
  const value = ' {\r\n "id":1e+03,"id":-0,"message":"Hi \\u263a","ok":true,"none":null\r\n } '
  const parts = highlightCapturedJson(value)
  assert.equal(parts.map(part => part.text).join(''), value)
  assert.deepEqual(parts.filter(part => part.className === 'execution-code-number').map(part => part.text), ['1e+03', '-0'])
  assert.equal(parts.filter(part => part.className === 'execution-code-key' && part.text === '"id"').length, 2)
})

test('plain captures, empty text and oversized JSON stay unmodified without token markup', () => {
  for (const value of ['', 'https://example.com/api?q={test}', 'plain response', '{"body":"' + 'x'.repeat(64_000) + '"}']) {
    assert.deepEqual(highlightCapturedJson(value), [{ text: value }])
  }
})

test('incomplete and invalid JSON captures remain inspectable without losing characters', () => {
  for (const value of ['{"message":"unfinished', '[true, 3, broken]', '{\n "duplicate":1, "duplicate":2,\n}']) {
    assert.equal(highlightCapturedJson(value).map(part => part.text).join(''), value)
  }
})

test('a large multiline preview returns complete original lines and accurate range counts', () => {
  const value = Array.from({ length: 10_000 }, (_, i) => `  "line-${i}": ${i},`).join('\n')
  const preview = previewCapturedCode(value)
  assert.equal(preview.text, value.split('\n').slice(0, 14).join('\n'))
  assert.deepEqual([preview.shownLines, preview.totalLines, preview.truncated, preview.partialLine], [14, 10_000, true, false])
})

test('single-line preview budgets preserve surrogate pairs and signal a partial line', () => {
  const value = 'a'.repeat(999) + '😀' + 'rest'.repeat(20_000)
  const preview = previewCapturedCode(value)
  assert.equal(preview.text, 'a'.repeat(999))
  assert.equal(preview.partialLine, true)
  assert.equal(preview.truncated, true)
})

test('short and empty captured bodies need no truncation', () => {
  for (const value of ['', '{"ok":true}', 'one\ntwo\n', Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n')]) {
    const preview = previewCapturedCode(value)
    assert.equal(preview.text, value)
    assert.equal(preview.truncated, false)
    assert.equal(preview.shownLines, preview.totalLines)
  }
})

test('body search treats punctuation literally, finds case variants and bounds dense results', () => {
  const value = '[a+b] [A+B] aab'
  const found = findCapturedText(value, '[a+b]')
  assert.deepEqual(found.matches.map(match => value.slice(match.from, match.to)), ['[a+b]', '[A+B]'])
  assert.deepEqual(findCapturedText(value, ''), { matches: [], hasMore: false })
  const bounded = findCapturedText('x'.repeat(1_002), 'x')
  assert.equal(bounded.matches.length, 1_000)
  assert.equal(bounded.hasMore, true)
})

test('search decoration and line numbering preserve captured text across syntax boundaries', () => {
  const value = '{\r\n "id": 124,\n "name":"Alex",\n "id": 124\n}\n'
  const parts = highlightCapturedJson(value)
  const decorated = decorateCapturedCode(parts, findCapturedText(value, '"id": 124').matches)
  assert.equal(decorated.filter(part => part.matchIndex === 0).map(part => part.text).join(''), '"id": 124')
  assert.equal(decorated.map(part => part.text).join(''), value)
  assert.equal(capturedCodeLines(decorated).map(line => line.map(part => part.text).join('')).join('\n'), value)
  assert.equal(capturedCodeLines(decorated).length, 6)
})
