import { Facet, Prec, StateField } from '@codemirror/state'
import type { EditorState, Extension } from '@codemirror/state'
import { Decoration, EditorView, keymap, WidgetType } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'
import {
  closeSuggestions, confirmSuggestionSpec, insertTokenSpec, moveSuggestion, setVariables, suggestionCount, suggestionField, suggestionItems, suggestionQuery,
  templateStateExtensions, TOKEN_CHAR, tokensField, variablesField,
} from '../lib/template-editor'
import { findVariable, indexVariables, valuePreview } from '../lib/variables'
import type { Variable } from '../lib/variables'
import type { VariableToken } from '../lib/templates'

/** Shared by read-only displays and editors: `{{NAME}}` in color, red when the variable is missing. */
export function tokenPresentation(token: VariableToken, variables: readonly Variable[] | null) {
  const variable = variables ? findVariable(token, indexVariables(variables)) : undefined
  const missing = variables !== null && !variable
  const name = variable?.name ?? token.name
  const title = missing ? `Missing variable ${name}` : variable ? `${name} = ${valuePreview(variable)}` : name
  return { name, missing, title }
}

class TokenWidget extends WidgetType {
  readonly name: string
  readonly missing: boolean
  readonly title: string
  constructor({ name, missing, title }: { name: string; missing: boolean; title: string }) {
    super()
    this.name = name
    this.missing = missing
    this.title = title
  }
  eq(other: TokenWidget) { return other.name === this.name && other.missing === this.missing && other.title === this.title }
  toDOM() {
    const element = document.createElement('span')
    element.className = 'variable-token'
    element.dataset.missing = String(this.missing)
    element.title = this.title
    element.setAttribute('role', 'img')
    element.setAttribute('aria-label', this.missing ? `Missing variable ${this.name}` : `Variable ${this.name}`)
    const brace = (text: string) => Object.assign(document.createElement('span'), { className: 'variable-brace', textContent: text })
    element.append(brace('{{'), this.name, brace('}}'))
    return element
  }
  ignoreEvent() { return false }
}

function tokenDecorations(state: EditorState): DecorationSet {
  const variables = state.field(variablesField)
  return Decoration.set(state.field(tokensField).map(placed => Decoration.replace({
    widget: new TokenWidget(tokenPresentation(placed.token, variables)),
  }).range(placed.pos, placed.pos + 1)))
}

const decorationsField = StateField.define<DecorationSet>({
  create: tokenDecorations,
  update(decorations, transaction) {
    const changed = transaction.startState.field(tokensField) !== transaction.state.field(tokensField) ||
      transaction.startState.field(variablesField) !== transaction.state.field(variablesField)
    return changed ? tokenDecorations(transaction.state) : decorations.map(transaction.changes)
  },
  provide: field => [EditorView.decorations.from(field), EditorView.atomicRanges.of(view => view.state.field(field))],
})

/** Opens the dialog that creates a variable from the suggestions; `insert` adds the new variable as a token. */
export type CreateVariableRequest = { name: string; insert: (variable: Variable) => void; cancel: () => void }
export const createVariableHandler = Facet.define<(request: CreateVariableRequest) => void, ((request: CreateVariableRequest) => void) | null>({
  combine: handlers => handlers[0] ?? null,
})

/** Copies show variables as `{{NAME}}` text, never values. Pasted text is always plain text. */
const clipboard = [
  EditorView.clipboardOutputFilter.of((text, state) => {
    if (!text.includes(TOKEN_CHAR)) return text
    const ranges = state.selection.ranges
    const copied = ranges.every(range => range.empty)
      ? ranges.map(range => ({ from: state.doc.lineAt(range.head).from, to: state.doc.lineAt(range.head).to + 1 }))
      : ranges.filter(range => !range.empty)
    const variables = state.field(variablesField)
    const names = state.field(tokensField).filter(placed => copied.some(range => placed.pos >= range.from && placed.pos < range.to))
      .map(placed => tokenPresentation(placed.token, variables).name)
    let index = 0
    return text.replaceAll(TOKEN_CHAR, () => `{{${names[index++] ?? ''}}}`)
  }),
  EditorView.clipboardInputFilter.of(text => text.replaceAll(TOKEN_CHAR, '')),
]

function chooseSuggestion(view: EditorView, index = view.state.field(suggestionField)?.index ?? 0) {
  const suggestion = view.state.field(suggestionField)
  if (!suggestion) return false
  const items = suggestionItems(view.state)
  const variable = items.variables[index]
  if (variable) {
    const spec = confirmSuggestionSpec(view.state, variable)
    if (spec) view.dispatch(spec)
    return true
  }
  const handler = view.state.facet(createVariableHandler)
  if (!items.create || index !== items.variables.length || !handler) return false
  const { from } = suggestion
  const typed = `{{${suggestionQuery(view.state) ?? ''}`
  view.dispatch({ effects: closeSuggestions.of(null) })
  handler({
    name: items.create,
    insert: created => {
      // Show the new variable at once, before storage reports it.
      view.dispatch({ effects: setVariables.of([...(view.state.field(variablesField) ?? []).filter(variable => variable.id !== created.id), created]) })
      // Insert where the user was typing, when that text is still there.
      const head = view.state.selection.main.head
      const atTyped = view.state.sliceDoc(from, from + typed.length) === typed
      const end = atTyped && view.state.sliceDoc(from + typed.length, from + typed.length + 2) === '}}' ? from + typed.length + 2 : from + typed.length
      view.dispatch(insertTokenSpec(atTyped ? from : head, atTyped ? end : head, { variableId: created.id, name: created.name }))
      view.focus()
    },
    cancel: () => view.focus(),
  })
  return true
}

export { chooseSuggestion }

function moveHighlight(view: EditorView, direction: number) {
  const suggestion = view.state.field(suggestionField)
  if (!suggestion) return false
  const count = suggestionCount(suggestionItems(view.state))
  if (count) view.dispatch({ effects: moveSuggestion.of((suggestion.index + direction + count) % count) })
  return true
}

// While suggestions are open, these keys stop here, so form, dialog, and domain shortcuts do not run.
const suggestionKeys = Prec.highest(keymap.of([
  { key: 'ArrowDown', run: view => moveHighlight(view, 1), stopPropagation: true },
  { key: 'ArrowUp', run: view => moveHighlight(view, -1), stopPropagation: true },
  { key: 'Enter', run: view => chooseSuggestion(view), stopPropagation: true },
  { key: 'Tab', run: view => chooseSuggestion(view), stopPropagation: true },
  { key: 'Escape', run: view => {
    if (!view.state.field(suggestionField)) return false
    view.dispatch({ effects: closeSuggestions.of(null) })
    return true
  }, stopPropagation: true },
]))

// Clicking elsewhere keeps the typed text as plain text.
const closeOnBlur = EditorView.domEventHandlers({
  blur: (_event, view) => {
    if (view.state.field(suggestionField)) view.dispatch({ effects: closeSuggestions.of(null) })
    return false
  },
})

function accessibility(listId: string) {
  return EditorView.contentAttributes.compute([suggestionField, variablesField], state => {
    const suggestion = state.field(suggestionField)
    const count = suggestion ? suggestionCount(suggestionItems(state)) : 0
    return {
      'aria-autocomplete': 'list', 'aria-expanded': String(!!suggestion), 'aria-controls': listId,
      ...(suggestion && count ? { 'aria-activedescendant': `${listId}-${suggestion.index}` } : {}),
    }
  })
}

export function templateViewExtensions(listId: string): Extension {
  return [templateStateExtensions(), decorationsField, suggestionKeys, clipboard, closeOnBlur, accessibility(listId)]
}

/** For dialogs that see Escape first: closes open suggestions in the focused field and reports whether it did. */
export function closeSuggestionsOnEscape(event: KeyboardEvent) {
  const content = event.target instanceof Element ? event.target.closest('.cm-content') : null
  if (content?.getAttribute('aria-expanded') !== 'true') return false
  const view = EditorView.findFromDOM(content as HTMLElement)
  if (!view?.state.field(suggestionField, false)) return false
  view.dispatch({ effects: closeSuggestions.of(null) })
  return true
}
