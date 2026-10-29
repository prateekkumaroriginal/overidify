import { EditorState } from '@codemirror/state'
import type { Extension, Transaction } from '@codemirror/state'
import { history, isolateHistory, redo, redoDepth, undo, undoDepth } from '@codemirror/commands'
import { editResponseTree, formatResponseBody } from './response-editor.ts'
import type { TreeEdit } from './response-editor.ts'

/** One document and history, independent of the active mode or mounted view. */
export class ResponseEditorSession {
  state: EditorState
  private listeners = new Set<(transactions: readonly Transaction[]) => void>()

  constructor(body: string, extensions: Extension = []) {
    this.state = EditorState.create({ doc: body, extensions: [EditorState.lineSeparator.of('\n'), history(), extensions] })
  }
  get body() { return this.state.doc.toString() }
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
  replace(body: string) {
    if (body === this.body) return
    this.dispatch(this.state.update({ changes: { from: 0, to: this.state.doc.length, insert: body }, annotations: isolateHistory.of('full') }))
  }
  editTree(edit: TreeEdit) { this.replace(editResponseTree(this.body, edit)) }
  format() { this.replace(formatResponseBody(this.body)) }
  undo() { return undo(this) }
  redo() { return redo(this) }
}
