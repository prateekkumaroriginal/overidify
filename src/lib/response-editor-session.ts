import { Compartment, EditorState, Transaction } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { history, isolateHistory, redo, redoDepth, undo, undoDepth } from '@codemirror/commands'
import { formatResponseBody } from './response-editor.ts'
import { setTemplateSpec, stateTemplate, templateDocument, setReferences, templateStateExtensions } from './template-editor-state.ts'
import { hasReferences, templatesEqual } from './templates.ts'
import type { TemplateText } from './templates.ts'

/** One document and history, independent of the mounted view. */
export class ResponseEditorSession {
  state: EditorState
  private listeners = new Set<(transactions: readonly Transaction[]) => void>()
  private history = new Compartment()

  constructor(value: TemplateText, extensions: Extension = []) {
    const { text, references } = templateDocument(value)
    const state = EditorState.create({ doc: text, extensions: [EditorState.lineSeparator.of('\n'), this.history.of(history()), templateStateExtensions(), extensions] })
    this.state = state.update({ effects: setReferences.of(references), annotations: Transaction.addToHistory.of(false) }).state
  }
  /** Display text. References read as {{NAME}}. */
  get body() { return this.state.doc.toString() }
  get template(): TemplateText { return stateTemplate(this.state) }
  get canUndo() { return undoDepth(this.state) > 0 }
  get canRedo() { return redoDepth(this.state) > 0 }
  subscribe = (listener: (transactions: readonly Transaction[]) => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  dispatch = (transaction: Transaction) => { this.apply([transaction]) }
  apply(transactions: readonly Transaction[]) {
    for (const transaction of transactions) this.state = transaction.state
    for (const listener of this.listeners) listener(transactions)
  }
  replace(value: TemplateText) {
    if (templatesEqual(value, this.template)) return
    this.dispatch(this.state.update({ ...setTemplateSpec(this.state, value), annotations: isolateHistory.of('full') }))
  }
  replaceFromOutside(value: TemplateText) {
    if (templatesEqual(value, this.template)) return
    // Undo must never restore references from before a saved rename.
    const reset = this.state.update(setTemplateSpec(this.state, value), { effects: this.history.reconfigure([]) })
    this.apply([reset, reset.state.update({ effects: this.history.reconfigure(history()) })])
  }
  format() {
    // JSON formatting would treat reference text as literal JSON.
    if (hasReferences(this.template)) throw new Error('Format is unavailable while the body contains variables.')
    this.replace(formatResponseBody(this.body))
  }
  undo() { return undo(this) }
  redo() { return redo(this) }
}
