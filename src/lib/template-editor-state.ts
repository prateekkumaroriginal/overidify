import { ChangeSet, EditorState, StateEffect, StateField, Transaction } from '@codemirror/state'
import type { ChangeSpec, Extension, TransactionSpec } from '@codemirror/state'
import { invertedEffects } from '@codemirror/commands'
import { fromParts, rankVariableSuggestions, templateParts, VARIABLE_NAME_MAX_LENGTH } from './templates.ts'
import type { TemplatePart, TemplateText } from './templates.ts'

/**
 * Editor state for template fields. The document holds display text; each
 * reference's `{{NAME}}` range is tracked here and mapped through every change.
 * Plain text that reads `{{NAME}}` is never a reference.
 */
export type ReferenceRange = { from: number; to: number; name: string }

const mapRanges = (ranges: ReferenceRange[], mapping: { mapPos: (pos: number, assoc?: number) => number }) =>
  ranges.map(range => ({ ...range, from: mapping.mapPos(range.from, 1), to: mapping.mapPos(range.to, -1) })).filter(range => range.to > range.from)

/** Adds references whose text is already in the new document. Positions refer to the document after the transaction. */
export const addReferences = StateEffect.define<ReferenceRange[]>({ map: mapRanges })
/** Replaces every reference, used when the whole value is set from outside. */
export const setReferences = StateEffect.define<ReferenceRange[]>({ map: mapRanges })

function touches(changes: ChangeSet, range: ReferenceRange) {
  let touched = false
  changes.iterChangedRanges((from, to) => {
    if (from === to ? from > range.from && from < range.to : from < range.to && to > range.from) touched = true
  })
  return touched
}

function settle(ranges: ReferenceRange[], state: EditorState): ReferenceRange[] {
  let end = -1
  return [...ranges].sort((left, right) => left.from - right.from).filter(range => {
    const valid = range.from >= end && range.to <= state.doc.length && state.sliceDoc(range.from, range.to) === `{{${range.name}}}`
    if (valid) end = range.to
    return valid
  })
}

export const referencesField = StateField.define<ReferenceRange[]>({
  create: () => [],
  update(ranges, transaction) {
    let next = ranges
    if (transaction.docChanged) {
      next = ranges.filter(range => !touches(transaction.changes, range)).map(range => ({
        ...range, from: transaction.changes.mapPos(range.from, 1), to: transaction.changes.mapPos(range.to, -1),
      }))
    }
    let added = false
    for (const effect of transaction.effects) {
      if (effect.is(setReferences)) { next = effect.value; added = true }
      else if (effect.is(addReferences)) { next = [...next, ...effect.value]; added = true }
    }
    return added || transaction.docChanged ? settle(next, transaction.state) : next
  },
})

// Undo and redo restore references removed by the undone or redone change.
const restoreReferences = invertedEffects.of(transaction => {
  if (!transaction.docChanged) return []
  const removed = transaction.startState.field(referencesField).filter(range => touches(transaction.changes, range))
  return removed.length ? [addReferences.of(removed)] : []
})

/** A change that partly overlaps a reference is widened to replace the whole reference. */
const widenPartialChanges = EditorState.transactionFilter.of(transaction => {
  const ranges = transaction.startState.field(referencesField, false)
  if (!transaction.docChanged || !ranges?.length) return transaction
  let widened = false
  const changes: { from: number; to: number; insert: string }[] = []
  transaction.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    let from = fromA, to = toA, moved = true
    while (moved) {
      moved = false
      for (const range of ranges) {
        if (from === to) {
          if (from > range.from && from < range.to) { from = to = range.to; moved = widened = true }
        } else if (from < range.to && to > range.from && (from > range.from || to < range.to)) {
          from = Math.min(from, range.from); to = Math.max(to, range.to); moved = widened = true
        }
      }
    }
    changes.push({ from, to, insert: inserted.toString() })
  })
  if (!widened) return transaction
  const merged: typeof changes = []
  for (const change of changes.sort((left, right) => left.from - right.from)) {
    const last = merged.at(-1)
    if (last && change.from <= last.to) { last.to = Math.max(last.to, change.to); last.insert += change.insert }
    else merged.push({ ...change })
  }
  const userEvent = transaction.annotation(Transaction.userEvent)
  return { changes: merged, effects: transaction.effects, scrollIntoView: transaction.scrollIntoView,
    annotations: transaction.annotation(Transaction.addToHistory) === false ? [Transaction.addToHistory.of(false)] : [], ...(userEvent ? { userEvent } : {}) }
})

/** Removes typed or pasted line breaks, matching a native single-line input. */
export const singleLineFilter = EditorState.transactionFilter.of(transaction => {
  if (!transaction.docChanged || transaction.newDoc.lines === 1 || !transaction.isUserEvent('input') && !transaction.isUserEvent('move')) return transaction
  const changes: ChangeSpec[] = []
  transaction.changes.iterChanges((from, to, _fromB, _toB, inserted) => changes.push({ from, to, insert: inserted.toString().replace(/\r\n?|\n/g, '') }))
  return { changes, userEvent: transaction.annotation(Transaction.userEvent) }
})

export function templateDocument(value: TemplateText): { text: string; references: ReferenceRange[] } {
  let text = ''
  const references: ReferenceRange[] = []
  for (const part of templateParts(value)) {
    if (typeof part === 'string') text += part
    else {
      const chip = `{{${part.variable}}}`
      references.push({ from: text.length, to: text.length + chip.length, name: part.variable })
      text += chip
    }
  }
  return { text, references }
}

export function partsInRange(state: EditorState, from: number, to: number): TemplatePart[] {
  const parts: TemplatePart[] = []
  let position = from
  for (const range of state.field(referencesField)) {
    if (range.to <= from || range.from >= to) continue
    if (range.from < from || range.to > to) continue
    if (range.from > position) parts.push(state.sliceDoc(position, range.from))
    parts.push({ variable: range.name })
    position = range.to
  }
  if (to > position) parts.push(state.sliceDoc(position, to))
  return templateParts(fromParts(parts))
}

export function stateTemplate(state: EditorState): TemplateText {
  return fromParts(partsInRange(state, 0, state.doc.length))
}

export function setTemplateSpec(state: EditorState, value: TemplateText): TransactionSpec {
  const { text, references } = templateDocument(value)
  return { changes: { from: 0, to: state.doc.length, insert: text }, effects: setReferences.of(references) }
}

/** Inserts parts, including references, in place of a range. */
export function insertPartsSpec(from: number, to: number, parts: TemplatePart[], singleLine: boolean): TransactionSpec {
  let text = ''
  const references: ReferenceRange[] = []
  for (const part of parts) {
    if (typeof part === 'string') text += singleLine ? part.replace(/\r\n?|\n/g, '') : part
    else {
      const chip = `{{${part.variable}}}`
      references.push({ from: from + text.length, to: from + text.length + chip.length, name: part.variable })
      text += chip
    }
  }
  return { changes: { from, to, insert: text }, effects: addReferences.of(references), selection: { anchor: from + text.length } }
}

/** Positions inside a reference move to its end so a drop never splits it. */
export function outsideReferences(state: EditorState, position: number) {
  const range = state.field(referencesField).find(range => position > range.from && position < range.to)
  return range ? range.to : position
}

// Suggestions: opened only by typing a second consecutive "{".
export type SuggestionState = { anchor: number; index: number }
export const closeSuggestions = StateEffect.define<null>()
export const moveSuggestion = StateEffect.define<number>()
/** Saved variable names with valid names, for suggestions and missing markers. Null until loaded. */
export const setKnownVariables = StateEffect.define<string[] | null>()
export const knownVariablesField = StateField.define<string[] | null>({
  create: () => null,
  update(names, transaction) {
    for (const effect of transaction.effects) if (effect.is(setKnownVariables)) names = effect.value
    return names
  },
})

const QUERY = /^ *[A-Za-z0-9_]*$/

export function suggestionQuery(state: EditorState, suggestion: SuggestionState) {
  return state.sliceDoc(suggestion.anchor + 2, state.selection.main.head)
}

export function suggestionItems(state: EditorState): string[] {
  const suggestion = state.field(suggestionField, false)
  if (!suggestion) return []
  return rankVariableSuggestions(state.field(knownVariablesField) ?? [], suggestionQuery(state, suggestion))
}

function typedBrace(transaction: Transaction) {
  if (!transaction.isUserEvent('input.type') || transaction.isUserEvent('input.type.compose')) return false
  let brace = false
  transaction.changes.iterChanges((_fromA, _toA, _fromB, toB, inserted) => {
    if (inserted.toString().endsWith('{') && toB === transaction.state.selection.main.head) brace = true
  })
  return brace
}

export const suggestionField = StateField.define<SuggestionState | null>({
  create: () => null,
  update(value, transaction) {
    if (value && transaction.docChanged) value = { ...value, anchor: transaction.changes.mapPos(value.anchor, 1) }
    for (const effect of transaction.effects) {
      if (effect.is(closeSuggestions)) value = null
      else if (effect.is(moveSuggestion) && value) value = { ...value, index: effect.value }
    }
    const state = transaction.state
    const head = state.selection.main.head
    if (typedBrace(transaction) && head >= 2 && state.sliceDoc(head - 2, head) === '{{') value = { anchor: head - 2, index: 0 }
    if (!value) return null
    const query = state.sliceDoc(value.anchor + 2, head)
    const inReference = state.field(referencesField).some(range => range.from < head && range.to > value!.anchor)
    if (!state.selection.main.empty || head < value.anchor + 2 || state.sliceDoc(value.anchor, value.anchor + 2) !== '{{' ||
      inReference || !QUERY.test(query) || query.replace(/^ +/, '').length > VARIABLE_NAME_MAX_LENGTH) return null
    if (transaction.docChanged && !transaction.effects.some(effect => effect.is(moveSuggestion))) value = { ...value, index: 0 }
    return value
  },
})

/** Replaces `{{`, the query, and any `}}` right after the caret with a reference. */
export function confirmSuggestionSpec(state: EditorState, name: string): TransactionSpec | null {
  const suggestion = state.field(suggestionField, false)
  if (!suggestion) return null
  const head = state.selection.main.head
  const end = state.sliceDoc(head, head + 2) === '}}' ? head + 2 : head
  return { ...insertPartsSpec(suggestion.anchor, end, [{ variable: name }], true), userEvent: 'input.complete', effects: [
    addReferences.of([{ from: suggestion.anchor, to: suggestion.anchor + name.length + 4, name }]), closeSuggestions.of(null),
  ] }
}

export function templateStateExtensions(): Extension {
  return [referencesField, restoreReferences, widenPartialChanges, knownVariablesField, suggestionField]
}
