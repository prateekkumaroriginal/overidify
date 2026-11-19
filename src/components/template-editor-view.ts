import { Prec, StateField } from '@codemirror/state'
import type { EditorState, Extension } from '@codemirror/state'
import { Decoration, EditorView, keymap, WidgetType } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'
import {
  closeSuggestions, confirmSuggestionSpec, insertPartsSpec, knownVariablesField, moveSuggestion, outsideReferences, partsInRange,
  referencesField, suggestionField, suggestionItems, templateStateExtensions,
} from '../lib/template-editor-state'
import { displayText, fromParts, parseTemplateClipboard, serializeTemplateClipboard, TEMPLATE_CLIPBOARD_TYPE } from '../lib/templates'

const warningIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>'

class ReferenceChip extends WidgetType {
  readonly name: string
  readonly missing: boolean
  constructor(name: string, missing: boolean) {
    super()
    this.name = name
    this.missing = missing
  }
  eq(other: ReferenceChip) { return other.name === this.name && other.missing === this.missing }
  toDOM() {
    const chip = document.createElement('span')
    chip.className = 'template-chip'
    chip.dataset.missing = String(this.missing)
    chip.setAttribute('role', 'img')
    const label = `${this.missing ? 'Missing variable' : 'Variable'} ${this.name}`
    chip.setAttribute('aria-label', label)
    if (this.missing) { chip.title = label; chip.innerHTML = warningIcon }
    chip.append(`{{${this.name}}}`)
    return chip
  }
  ignoreEvent() { return false }
}

function chipDecorations(state: EditorState): DecorationSet {
  const known = state.field(knownVariablesField)
  return Decoration.set(state.field(referencesField).map(range => Decoration.replace({
    widget: new ReferenceChip(range.name, known !== null && !known.includes(range.name)),
  }).range(range.from, range.to)))
}

const chipsField = StateField.define<DecorationSet>({
  create: chipDecorations,
  update(decorations, transaction) {
    const changed = transaction.startState.field(referencesField) !== transaction.state.field(referencesField) ||
      transaction.startState.field(knownVariablesField) !== transaction.state.field(knownVariablesField)
    return changed ? chipDecorations(transaction.state) : decorations.map(transaction.changes)
  },
  provide: field => [EditorView.decorations.from(field), EditorView.atomicRanges.of(view => view.state.field(field))],
})

let dragSource: { view: EditorView; from: number; to: number } | null = null

/** An empty selection copies the whole line, like CodeMirror's own copy, but keeps its references. */
function copiedRange(view: EditorView) {
  const main = view.state.selection.main
  return main.empty ? view.state.doc.lineAt(main.head) : main
}

function writeClipboard(view: EditorView, data: DataTransfer | null) {
  const range = copiedRange(view)
  if (range.from === range.to || !data) return false
  const parts = partsInRange(view.state, range.from, range.to)
  // Text/plain holds display text. Values are never placed on the clipboard.
  data.clearData()
  data.setData('text/plain', displayText(fromParts(parts)))
  data.setData(TEMPLATE_CLIPBOARD_TYPE, serializeTemplateClipboard(parts))
  return true
}

function clipboardHandlers(singleLine: boolean): Extension {
  return EditorView.domEventHandlers({
    copy(event, view) {
      if (!writeClipboard(view, event.clipboardData)) return false
      event.preventDefault()
      return true
    },
    cut(event, view) {
      if (view.state.readOnly || !writeClipboard(view, event.clipboardData)) return false
      event.preventDefault()
      const range = copiedRange(view)
      view.dispatch({ changes: { from: range.from, to: range.to }, userEvent: 'delete.cut', scrollIntoView: true })
      return true
    },
    paste(event, view) {
      // Only Overidify's own flavor recreates references. Everything else is literal text.
      const parts = parseTemplateClipboard(event.clipboardData?.getData(TEMPLATE_CLIPBOARD_TYPE))
      if (!parts || view.state.readOnly) return false
      event.preventDefault()
      const range = view.state.selection.main
      view.dispatch({ ...insertPartsSpec(range.from, range.to, parts, singleLine), userEvent: 'input.paste', scrollIntoView: true })
      return true
    },
    dragstart(event, view) {
      const range = view.state.selection.main
      if (!range.empty && event.dataTransfer) {
        event.dataTransfer.setData(TEMPLATE_CLIPBOARD_TYPE, serializeTemplateClipboard(partsInRange(view.state, range.from, range.to)))
        dragSource = { view, from: range.from, to: range.to }
      }
      return false
    },
    dragend() { dragSource = null; return false },
    drop(event, view) {
      const parts = parseTemplateClipboard(event.dataTransfer?.getData(TEMPLATE_CLIPBOARD_TYPE))
      if (!parts) return false
      event.preventDefault()
      if (view.state.readOnly) return true
      const target = view.posAtCoords({ x: event.clientX, y: event.clientY }, false)
      const position = outsideReferences(view.state, target)
      const source = dragSource?.view === view && !(event.ctrlKey || event.altKey) ? dragSource : null
      dragSource = null
      view.focus()
      if (source && position >= source.from && position <= source.to) return true
      const insert = insertPartsSpec(position, position, parts, singleLine)
      if (!source) { view.dispatch({ ...insert, userEvent: 'input.drop' }); return true }
      // Moving within one field deletes the source and inserts at the mapped drop position.
      const removal = view.state.changes({ from: source.from, to: source.to })
      const mapped = removal.mapPos(position, -1)
      view.dispatch({ changes: { from: source.from, to: source.to }, userEvent: 'move.drop' },
        { ...insertPartsSpec(mapped, mapped, parts, singleLine), userEvent: 'move.drop', sequential: true })
      return true
    },
    blur(_event, view) {
      if (view.state.field(suggestionField)) view.dispatch({ effects: closeSuggestions.of(null) })
      return false
    },
  })
}

function moveHighlight(view: EditorView, direction: number) {
  const suggestion = view.state.field(suggestionField)
  if (!suggestion) return false
  const count = suggestionItems(view.state).length
  if (count) view.dispatch({ effects: moveSuggestion.of((suggestion.index + direction + count) % count) })
  return true
}

/** Confirms a highlighted suggestion. With nothing highlighted, closes the list and lets the field's own Enter run. */
export function confirmSuggestion(view: EditorView, name?: string) {
  const suggestion = view.state.field(suggestionField)
  if (!suggestion) return false
  const items = suggestionItems(view.state)
  const chosen = name ?? items[suggestion.index]
  if (!chosen) { view.dispatch({ effects: closeSuggestions.of(null) }); return false }
  const spec = confirmSuggestionSpec(view.state, chosen)
  if (spec) view.dispatch({ ...spec, scrollIntoView: true })
  return true
}

// While the list is open, its keys stop here so editor, domain, and Select-mode shortcuts do not run.
const suggestionKeys = Prec.highest(keymap.of([
  { key: 'ArrowDown', run: view => moveHighlight(view, 1), stopPropagation: true },
  { key: 'ArrowUp', run: view => moveHighlight(view, -1), stopPropagation: true },
  { key: 'Enter', run: view => confirmSuggestion(view), stopPropagation: true },
  { key: 'Escape', run: view => {
    if (!view.state.field(suggestionField)) return false
    view.dispatch({ effects: closeSuggestions.of(null) })
    return true
  }, stopPropagation: true },
]))

function accessibility(listId: string) {
  return EditorView.contentAttributes.compute([suggestionField, knownVariablesField], state => {
    const suggestion = state.field(suggestionField)
    const items = suggestion ? suggestionItems(state) : []
    return {
      'aria-autocomplete': 'list', 'aria-expanded': String(!!suggestion), 'aria-controls': listId,
      ...(suggestion && items.length ? { 'aria-activedescendant': `${listId}-${suggestion.index}` } : {}),
    }
  })
}

export function templateViewExtensions({ listId, singleLine }: { listId: string; singleLine: boolean }): Extension {
  return [templateStateExtensions(), chipsField, suggestionKeys, clipboardHandlers(singleLine), accessibility(listId)]
}

/**
 * For dialogs that see Escape before the editor: closes an open suggestion list
 * in the event's field and returns true, so the dialog stays open.
 */
export function closeSuggestionsOnEscape(event: KeyboardEvent) {
  const content = event.target instanceof Element ? event.target.closest('.cm-content') : null
  if (content?.getAttribute('aria-expanded') !== 'true') return false
  const view = EditorView.findFromDOM(content as HTMLElement)
  if (!view?.state.field(suggestionField, false)) return false
  view.dispatch({ effects: closeSuggestions.of(null) })
  return true
}
