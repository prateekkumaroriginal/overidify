import { useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import type { Ref } from 'react'
import { Annotation, Compartment, EditorState, Transaction } from '@codemirror/state'
import { EditorView, keymap, placeholder as placeholderExtension } from '@codemirror/view'
import { history, historyKeymap, standardKeymap } from '@codemirror/commands'
import { knownVariablesField, setKnownVariables, setTemplateSpec, singleLineFilter, stateTemplate, suggestionField, suggestionItems } from '../lib/template-editor-state'
import { templatesEqual } from '../lib/templates'
import type { TemplateText } from '../lib/templates'
import { cn } from '../lib/utils'
import { confirmSuggestion, templateViewExtensions } from './template-editor-view'
import { useVariableNames } from './variables-context'

export type TemplateInputHandle = { focus: () => void; select: () => void }
/** Marks value updates from React so they are not reported back as edits. */
const externalUpdate = Annotation.define<boolean>()

/** Suggestion list for any template editor, positioned inside `container`. Shows names only, never values. */
export function TemplateSuggestionList({ view, listId, container }: { view: EditorView | null; listId: string; container: HTMLElement | null }) {
  const suggestion = view?.state.field(suggestionField, false)
  if (!view || !suggestion || !container) return null
  const items = suggestionItems(view.state)
  const known = view.state.field(knownVariablesField) ?? []
  const coords = view.coordsAtPos(suggestion.anchor)
  const box = container.getBoundingClientRect()
  const style = coords ? { top: coords.bottom - box.top + 4, left: Math.max(0, Math.min(coords.left - box.left, box.width - 160)) } : { top: '100%', left: 0 }
  return <div className="template-suggestions" style={style} onMouseDown={event => event.preventDefault()}>
    {items.length ? <div role="listbox" id={listId} aria-label="Variables">
      {items.map((name, index) => <div key={name} id={`${listId}-${index}`} role="option" aria-selected={index === suggestion.index}
        className="template-suggestion" data-highlighted={index === suggestion.index}
        onMouseDown={event => { event.preventDefault(); confirmSuggestion(view, name) }}>{name}</div>)}
    </div> : <div id={listId} className="template-suggestion-empty" role="status">
      <span>{known.length ? 'No matching variable' : 'No variables yet'}</span>
      {/* A new tab keeps the current editor draft. */}
      <a href="options.html#/variables" target="_blank" rel="noreferrer">Open Variables</a>
    </div>}
  </div>
}

type Props = {
  value: TemplateText
  onChange: (value: TemplateText) => void
  onBlur?: () => void
  /** The field's own Enter action. Return false to let the event continue. */
  onEnter?: () => boolean | void
  onEscape?: () => boolean
  placeholder?: string
  id?: string
  disabled?: boolean
  invalid?: boolean
  className?: string
  autoFocus?: boolean
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  ref?: Ref<TemplateInputHandle>
}

/** A single-line template field. References are created only by confirming a `{{` suggestion. */
export function TemplateInput({ value, onChange, onBlur, onEnter, onEscape, placeholder, id, disabled = false, invalid, className, autoFocus, ref,
  'aria-label': label, 'aria-labelledby': labelledBy, 'aria-describedby': describedBy }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const [frame, setFrame] = useState<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [view, setView] = useState<EditorView | null>(null)
  const [, setRevision] = useState(0)
  const listId = useId()
  const names = useVariableNames()
  const latest = useRef({ onChange, onBlur, onEnter, onEscape })
  useLayoutEffect(() => { latest.current = { onChange, onBlur, onEnter, onEscape } })
  const [compartments] = useState(() => ({ editable: new Compartment(), attributes: new Compartment(), placeholder: new Compartment(), history: new Compartment() }))
  const initial = useRef({ value, disabled, autoFocus })

  useEffect(() => {
    const { value, disabled, autoFocus } = initial.current
    const state = EditorState.create({ extensions: [
      templateViewExtensions({ listId, singleLine: true }), singleLineFilter, compartments.history.of(history()),
      keymap.of([
        { key: 'Enter', run: () => latest.current.onEnter?.() !== false },
        { key: 'Escape', run: () => latest.current.onEscape?.() ?? false, stopPropagation: true },
        ...historyKeymap, ...standardKeymap.filter(binding => binding.key !== 'Enter' && binding.key !== 'Mod-Enter'),
      ]),
      compartments.editable.of([EditorView.editable.of(!disabled), EditorState.readOnly.of(disabled)]),
      compartments.attributes.of([]), compartments.placeholder.of([]),
      EditorView.contentAttributes.of({ spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off' }),
      EditorView.domEventHandlers({ blur: () => { latest.current.onBlur?.(); return false } }),
    ] })
    const editor = new EditorView({ state, parent: host.current!, dispatchTransactions(transactions, editor) {
      const before = editor.state
      editor.update(transactions)
      if (transactions.some(transaction => transaction.docChanged && !transaction.annotation(externalUpdate))) latest.current.onChange(stateTemplate(editor.state))
      if (before.field(suggestionField) !== editor.state.field(suggestionField) || before.doc !== editor.state.doc) setRevision(revision => revision + 1)
    } })
    editor.dispatch({ ...setTemplateSpec(editor.state, value), annotations: [Transaction.addToHistory.of(false), externalUpdate.of(true)] })
    viewRef.current = editor
    setView(editor)
    if (autoFocus) editor.focus()
    return () => { viewRef.current = null; editor.destroy() }
  }, [listId, compartments])

  useEffect(() => {
    if (!view || templatesEqual(value, stateTemplate(view.state))) return
    view.dispatch(setTemplateSpec(view.state, value), { effects: compartments.history.reconfigure([]), annotations: externalUpdate.of(true) })
    view.dispatch({ selection: { anchor: view.state.doc.length }, effects: compartments.history.reconfigure(history()) })
  }, [value, view, compartments])
  useEffect(() => { view?.dispatch({ effects: setKnownVariables.of(names) }) }, [names, view])
  useEffect(() => {
    view?.dispatch({ effects: compartments.editable.reconfigure([EditorView.editable.of(!disabled), EditorState.readOnly.of(disabled)]) })
  }, [disabled, view, compartments])
  useEffect(() => {
    view?.dispatch({ effects: [
      compartments.attributes.reconfigure(EditorView.contentAttributes.of({
        ...(label ? { 'aria-label': label } : {}), ...(labelledBy ? { 'aria-labelledby': labelledBy } : {}), ...(id ? { id } : {}),
        ...(describedBy ? { 'aria-describedby': describedBy } : {}), 'aria-invalid': String(!!invalid), role: 'combobox',
      })),
      compartments.placeholder.reconfigure(placeholder ? placeholderExtension(placeholder) : []),
    ] })
  }, [view, compartments, label, labelledBy, describedBy, id, invalid, placeholder])

  useImperativeHandle(ref, () => ({
    focus: () => viewRef.current?.focus(),
    select: () => {
      const editor = viewRef.current
      if (!editor) return
      editor.focus()
      editor.dispatch({ selection: { anchor: 0, head: editor.state.doc.length } })
    },
  }), [])

  return <div ref={setFrame} className={cn('template-input relative min-w-0', className)} data-invalid={invalid || undefined} data-disabled={disabled || undefined}>
    <div ref={host} onMouseDown={event => { if (event.target === event.currentTarget) { event.preventDefault(); viewRef.current?.focus() } }} />
    <TemplateSuggestionList view={view} listId={listId} container={frame} />
  </div>
}
