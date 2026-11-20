import { EditorState, MapMode, StateEffect, StateField, Transaction } from '@codemirror/state'
import type { ChangeSpec, Extension, TransactionSpec } from '@codemirror/state'
import { invertedEffects } from '@codemirror/commands'
import { fromSegments, isValidVariableName, templateSegments, VARIABLE_NAME_MAX_LENGTH } from './templates.ts'
import type { TemplateSegment, TemplateText, VariableToken } from './templates.ts'
import { nameKey, sortVariables } from './variables.ts'
import type { Variable } from './variables.ts'

/**
 * Editor state for fields that hold variables. Each token is one private-use character in the
 * document, so edits can never split it. The token each character stands for is tracked here.
 * Typed and pasted text can never contain that character, so it never creates a token.
 */
export const TOKEN_CHAR = ''
export type PlacedToken = { pos: number; token: VariableToken }

const mapTokens = (tokens: PlacedToken[], mapping: { mapPos: (pos: number, assoc?: number) => number }) =>
  tokens.map(placed => ({ ...placed, pos: mapping.mapPos(placed.pos, 1) }))
/** Adds tokens whose characters are already in the document after the transaction. */
export const addTokens = StateEffect.define<PlacedToken[]>({ map: mapTokens })
/** Replaces every token, when the whole value is set from outside. */
export const resetTokens = StateEffect.define<PlacedToken[]>({ map: mapTokens })
const tokenUserEvent = 'input.variable'

export const tokensField = StateField.define<PlacedToken[]>({
  create: () => [],
  update(tokens, transaction) {
    let next = tokens
    if (transaction.docChanged) {
      next = tokens.flatMap(placed => {
        const pos = transaction.changes.mapPos(placed.pos, 1, MapMode.TrackAfter)
        return pos === null ? [] : [{ ...placed, pos }]
      })
    }
    for (const effect of transaction.effects) {
      if (effect.is(resetTokens)) next = effect.value
      else if (effect.is(addTokens)) next = [...next, ...effect.value]
    }
    if (next === tokens) return tokens
    const doc = transaction.state.doc
    const seen = new Set<number>()
    return next.filter(placed => {
      if (seen.has(placed.pos) || placed.pos < 0 || placed.pos >= doc.length || doc.sliceString(placed.pos, placed.pos + 1) !== TOKEN_CHAR) return false
      seen.add(placed.pos)
      return true
    }).sort((left, right) => left.pos - right.pos)
  },
})

// Undo and redo bring back the tokens a change removed.
const restoreTokens = invertedEffects.of(transaction => {
  if (!transaction.docChanged) return []
  const removed = transaction.startState.field(tokensField).filter(placed => transaction.changes.mapPos(placed.pos, 1, MapMode.TrackAfter) === null)
  return removed.length ? [addTokens.of(removed)] : []
})

/** Typed, pasted, and dropped text can never contain a token character. */
const stripTokenCharacters = EditorState.transactionFilter.of(transaction => {
  if (!transaction.docChanged || transaction.isUserEvent(tokenUserEvent) || !(transaction.isUserEvent('input') || transaction.isUserEvent('move'))) return transaction
  let found = false
  transaction.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => { if (inserted.toString().includes(TOKEN_CHAR)) found = true })
  if (!found) return transaction
  const changes: ChangeSpec[] = []
  transaction.changes.iterChanges((from, to, _fromB, _toB, inserted) => changes.push({ from, to, insert: inserted.toString().replaceAll(TOKEN_CHAR, '') }))
  return { changes, effects: transaction.effects, userEvent: transaction.annotation(Transaction.userEvent) }
})

/** Removes typed or pasted line breaks, as a native single-line input does. */
export const singleLineFilter = EditorState.transactionFilter.of(transaction => {
  if (!transaction.docChanged || transaction.newDoc.lines === 1 || !(transaction.isUserEvent('input') || transaction.isUserEvent('move'))) return transaction
  const changes: ChangeSpec[] = []
  transaction.changes.iterChanges((from, to, _fromB, _toB, inserted) => changes.push({ from, to, insert: inserted.toString().replace(/\r\n?|\n/g, '') }))
  return { changes, userEvent: transaction.annotation(Transaction.userEvent) }
})

export function templateDocument(value: TemplateText): { text: string; tokens: PlacedToken[] } {
  let text = ''
  const tokens: PlacedToken[] = []
  for (const segment of templateSegments(value)) {
    if (typeof segment === 'string') text += segment.replaceAll(TOKEN_CHAR, '')
    else { tokens.push({ pos: text.length, token: { variableId: segment.variableId, name: segment.name } }); text += TOKEN_CHAR }
  }
  return { text, tokens }
}

export function stateTemplate(state: EditorState): TemplateText {
  const segments: TemplateSegment[] = []
  let position = 0
  for (const placed of state.field(tokensField)) {
    segments.push(state.sliceDoc(position, placed.pos), placed.token)
    position = placed.pos + 1
  }
  segments.push(state.sliceDoc(position))
  return fromSegments(segments.map(segment => typeof segment === 'string' ? segment.replaceAll(TOKEN_CHAR, '') : segment))
}

export function setTemplateSpec(state: EditorState, value: TemplateText): TransactionSpec {
  const { text, tokens } = templateDocument(value)
  return { changes: { from: 0, to: state.doc.length, insert: text }, effects: resetTokens.of(tokens) }
}

/** Replaces a range with one token and places the cursor after it. */
export function insertTokenSpec(from: number, to: number, token: VariableToken): TransactionSpec {
  return { changes: { from, to, insert: TOKEN_CHAR }, effects: [addTokens.of([{ pos: from, token }]), closeSuggestions.of(null)],
    selection: { anchor: from + 1 }, userEvent: tokenUserEvent, scrollIntoView: true }
}

// The saved variables, for suggestions, token names, and missing markers. Null until loaded.
export const setVariables = StateEffect.define<Variable[] | null>()
export const variablesField = StateField.define<Variable[] | null>({
  create: () => null,
  update(value, transaction) {
    for (const effect of transaction.effects) if (effect.is(setVariables)) value = effect.value
    return value
  },
})

// Suggestions open only when typing makes `{{`. The query is the text typed after it.
export type Suggestion = { from: number; index: number }
export const closeSuggestions = StateEffect.define<null>()
export const moveSuggestion = StateEffect.define<number>()
const QUERY = /^[A-Za-z0-9_]*$/

function typedBraces(transaction: Transaction) {
  if (!transaction.isUserEvent('input.type') || transaction.isUserEvent('input.type.compose')) return null
  const head = transaction.state.selection.main.head
  let opened = false
  transaction.changes.iterChanges((_fromA, _toA, _fromB, toB, inserted) => {
    if (toB === head && inserted.toString().endsWith('{')) opened = true
  })
  return opened && head >= 2 && transaction.state.sliceDoc(head - 2, head) === '{{' ? head - 2 : null
}

export const suggestionField = StateField.define<Suggestion | null>({
  create: () => null,
  update(value, transaction) {
    if (value && transaction.docChanged) value = { ...value, from: transaction.changes.mapPos(value.from, 1) }
    for (const effect of transaction.effects) {
      if (effect.is(closeSuggestions)) value = null
      else if (effect.is(moveSuggestion) && value) value = { ...value, index: effect.value }
    }
    const opened = typedBraces(transaction)
    if (opened !== null) value = { from: opened, index: 0 }
    if (!value) return null
    const state = transaction.state
    const { empty, head } = state.selection.main
    const query = state.sliceDoc(value.from + 2, head)
    if (!empty || head < value.from + 2 || state.sliceDoc(value.from, value.from + 2) !== '{{' || !QUERY.test(query) || query.length > VARIABLE_NAME_MAX_LENGTH) return null
    return transaction.docChanged && opened === null ? { ...value, index: 0 } : value
  },
})

export function suggestionQuery(state: EditorState): string | null {
  const suggestion = state.field(suggestionField, false)
  return suggestion ? state.sliceDoc(suggestion.from + 2, state.selection.main.head) : null
}

export type SuggestionItems = { variables: Variable[]; create: string | null }

/** Name matches ignoring case: names that start with the query first, then names that contain it. */
export function rankVariables(variables: readonly Variable[], query: string): Variable[] {
  const key = nameKey(query)
  const rank = (variable: Variable) => nameKey(variable.name).startsWith(key) ? 0 : nameKey(variable.name).includes(key) ? 1 : 2
  return sortVariables(variables).filter(variable => rank(variable) < 2).sort((left, right) => rank(left) - rank(right))
}

export function suggestionItems(state: EditorState): SuggestionItems {
  const query = suggestionQuery(state)
  const variables = state.field(variablesField, false)
  if (query === null || !variables) return { variables: [], create: null }
  const matches = rankVariables(variables, query)
  const exists = variables.some(variable => nameKey(variable.name) === nameKey(query))
  return { variables: matches, create: query && isValidVariableName(query) && !exists ? query : null }
}

export const suggestionCount = (items: SuggestionItems) => items.variables.length + (items.create ? 1 : 0)

/** Replaces `{{`, the query, and a `}}` right after the cursor with the chosen variable. */
export function confirmSuggestionSpec(state: EditorState, variable: Variable): TransactionSpec | null {
  const suggestion = state.field(suggestionField, false)
  if (!suggestion) return null
  const head = state.selection.main.head
  const to = state.sliceDoc(head, head + 2) === '}}' ? head + 2 : head
  return insertTokenSpec(suggestion.from, to, { variableId: variable.id, name: variable.name })
}

export function templateStateExtensions(): Extension {
  return [tokensField, restoreTokens, stripTokenCharacters, variablesField, suggestionField]
}
