import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EditorState, Transaction } from '@codemirror/state'
import { history, undo } from '@codemirror/commands'
import {
  closeSuggestions, confirmSuggestionSpec, setTemplateSpec, setVariables, stateTemplate, suggestionField, suggestionItems, templateStateExtensions, TOKEN_CHAR,
} from '../src/lib/template-editor.ts'
import { ResponseEditorSession } from '../src/lib/response-editor-session.ts'
import { analyzeResponseBody } from '../src/lib/response-editor.ts'
import type { Variable } from '../src/lib/variables.ts'

const variables: Variable[] = [
  { id: 'a', name: 'STAGE_AUTH_TOKEN', value: 'x', secret: true },
  { id: 'b', name: 'TENANT_ID', value: 'acme', secret: false },
  { id: 'c', name: 'API_STAGE', value: 'y', secret: false },
]

function editor() {
  let clock = 0
  let state = EditorState.create({ extensions: [templateStateExtensions(), history()] })
  state = state.update({ effects: setVariables.of(variables) }).state
  const at = () => Transaction.time.of(clock += 1000)
  return {
    get state() { return state },
    type(text: string) {
      const head = state.selection.main.head
      state = state.update({ changes: { from: head, insert: text }, selection: { anchor: head + text.length }, userEvent: 'input.type', annotations: at() }).state
    },
    apply(spec: Parameters<EditorState['update']>[0]) { state = state.update({ ...spec, annotations: at() }).state },
  }
}

test('typing {{ opens suggestions, typing filters by name, and picking inserts a variable', () => {
  const field = editor()
  field.type('Bearer {')
  assert.equal(field.state.field(suggestionField), null)
  field.type('{')
  assert.deepEqual(suggestionItems(field.state).variables.map(item => item.name), ['API_STAGE', 'STAGE_AUTH_TOKEN', 'TENANT_ID'])
  field.type('stage')
  // Names that start with the query come before names that contain it; a new name can be created.
  assert.deepEqual(suggestionItems(field.state), { variables: [variables[0], variables[2]], create: 'stage' })
  field.type('}}')
  field.apply({ selection: { anchor: field.state.doc.length - 2 } })
  field.type('_X')
  assert.equal(field.state.field(suggestionField), null, 'a closing brace ends the suggestions')
  field.apply({ changes: { from: 7, to: field.state.doc.length, insert: '' } })
  field.type('{{')
  field.type('TEN')
  assert.deepEqual(suggestionItems(field.state), { variables: [variables[1]], create: 'TEN' })
  field.type('ANT_id')
  assert.equal(suggestionItems(field.state).create, null, 'names are unique ignoring case')
  field.apply(confirmSuggestionSpec(field.state, variables[1])!)
  assert.deepEqual(stateTemplate(field.state), { segments: ['Bearer ', { variableId: 'b', name: 'TENANT_ID' }] })
})

test('text that was not picked stays plain: Escape, typed braces, and pasted token characters', () => {
  const field = editor()
  field.type('{{')
  field.apply({ effects: closeSuggestions.of(null) })
  field.type('TENANT_ID}}')
  assert.equal(stateTemplate(field.state), '{{TENANT_ID}}')
  field.apply({ changes: { from: 0, insert: `x${TOKEN_CHAR}y` }, userEvent: 'input.paste' })
  assert.equal(stateTemplate(field.state), 'xy{{TENANT_ID}}')
})

test('a variable is removed whole and undo restores it', () => {
  const field = editor()
  field.apply(setTemplateSpec(field.state, { segments: ['a', { variableId: 'a', name: 'STAGE_AUTH_TOKEN' }, 'b'] }))
  field.apply({ changes: { from: 1, to: 2 }, userEvent: 'delete.backward' })
  assert.equal(stateTemplate(field.state), 'ab')
  let restored: Transaction | undefined
  undo({ state: field.state, dispatch: transaction => { restored = transaction } })
  assert.deepEqual(stateTemplate(restored!.state), { segments: ['a', { variableId: 'a', name: 'STAGE_AUTH_TOKEN' }, 'b'] })
})

test('response bodies with variables keep JSON checks and formatting exact', () => {
  const session = new ResponseEditorSession({ segments: ['{"token":', { variableId: 'a', name: 'STAGE_AUTH_TOKEN' }, ',"user":"', { variableId: 'b', name: 'TENANT_ID' }, '"}'] })
  assert.equal(analyzeResponseBody(session.body).available, true)
  session.format()
  assert.deepEqual(session.template, { segments: ['{\n  "token": ', { variableId: 'a', name: 'STAGE_AUTH_TOKEN' }, ',\n  "user": "', { variableId: 'b', name: 'TENANT_ID' }, '"\n}'] })
})
