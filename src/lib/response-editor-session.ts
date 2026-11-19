import { EditorState, Transaction } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { history, isolateHistory, redo, redoDepth, undo, undoDepth } from '@codemirror/commands'
import { formatEdits } from './response-editor.ts'
import { setTemplateSpec, stateTemplate, templateStateExtensions } from './template-editor.ts'
import { templatesEqual } from './templates.ts'
import type { TemplateText } from './templates.ts'

/** One document and history, independent of the mounted view. */
export class ResponseEditorSession {
  state: EditorState
  private listeners = new Set<(transactions: readonly Transaction[]) => void>()

  constructor(body: TemplateText, extensions: Extension = []) {
    // CodeMirror includes each template extension once, even when the view extensions repeat them.
    const state = EditorState.create({ extensions: [EditorState.lineSeparator.of('\n'), history(), templateStateExtensions(), extensions] })
    this.state = state.update({ ...setTemplateSpec(state, body), annotations: Transaction.addToHistory.of(false) }).state
  }
  /** The editor text. Each variable is one placeholder character. */
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
  replace(body: TemplateText) {
    if (templatesEqual(body, this.template)) return
    this.dispatch(this.state.update({ ...setTemplateSpec(this.state, body), annotations: isolateHistory.of('full') }))
  }
  format() {
    const changes = formatEdits(this.body).map(edit => ({ from: edit.offset, to: edit.offset + edit.length, insert: edit.content }))
    if (changes.length) this.dispatch(this.state.update({ changes, annotations: isolateHistory.of('full') }))
  }
  undo() { return undo(this) }
  redo() { return redo(this) }
}

