import { useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import type { Ref } from 'react'
import { Annotation, Compartment, EditorState, Transaction } from '@codemirror/state'
import { EditorView, keymap, placeholder as placeholderExtension } from '@codemirror/view'
import { history, historyKeymap, standardKeymap } from '@codemirror/commands'
import { setTemplateSpec, setVariables, singleLineFilter, stateTemplate, suggestionField } from '../lib/template-editor'
import { templatesEqual } from '../lib/templates'
import type { TemplateText } from '../lib/templates'
import { cn } from '../lib/utils'
import { createVariableHandler, templateViewExtensions } from './template-editor-view'
import { useVariables } from './variables-context'
import { VariableSuggestionList } from './VariableSuggestions'
import { useCreateVariableDialog } from './useCreateVariableDialog'

export type TemplateFieldHandle = { focus: () => void; select: () => void }
/** Marks value updates that come from React, so they are not reported back as edits. */
const fromProps = Annotation.define<boolean>()

type Props = {
  value: TemplateText
  onChange: (value: TemplateText) => void
  onBlur?: () => void
  /** The field's own Enter action, such as adding a website domain. Return false to let the key continue. */
  onEnter?: () => boolean | void
  /** The field's own Escape action. Return true when it handled the key. */
  onEscape?: () => boolean
  placeholder?: string
  id?: string
  disabled?: boolean
  invalid?: boolean
  className?: string
  autoFocus?: boolean
  'aria-label'?: string
  'aria-describedby'?: string
  ref?: Ref<TemplateFieldHandle>
}

/** A single-line input that can hold variables. Type `{{` to pick one; anything not picked stays plain text. */
export function TemplateField({ value, onChange, onBlur, onEnter, onEscape, placeholder, id, disabled = false, invalid, className, autoFocus, ref,
  'aria-label': label, 'aria-describedby': describedBy }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const [frame, setFrame] = useState<HTMLDivElement | null>(null)
  const [view, setView] = useState<EditorView | null>(null)
  const [, setRevision] = useState(0)
  const listId = useId()
  const variables = useVariables()
  const { request, dialog } = useCreateVariableDialog()
  const latest = useRef({ onChange, onBlur, onEnter, onEscape, request })
  useLayoutEffect(() => { latest.current = { onChange, onBlur, onEnter, onEscape, request } })
  const [compartments] = useState(() => ({ editable: new Compartment(), attributes: new Compartment(), placeholder: new Compartment() }))
  const initial = useRef({ value, disabled, autoFocus })

  useEffect(() => {
    const { value, disabled, autoFocus } = initial.current
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({ extensions: [
        templateViewExtensions(listId), singleLineFilter, history(),
        createVariableHandler.of(next => latest.current.request(next)),
        keymap.of([
          { key: 'Enter', run: () => latest.current.onEnter?.() !== false },
          { key: 'Escape', run: () => latest.current.onEscape?.() ?? false },
          ...historyKeymap, ...standardKeymap.filter(binding => binding.key !== 'Enter' && binding.key !== 'Mod-Enter'),
        ]),
        compartments.editable.of([EditorView.editable.of(!disabled), EditorState.readOnly.of(disabled)]),
        compartments.attributes.of([]), compartments.placeholder.of([]),
        EditorView.contentAttributes.of({ spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off', role: 'combobox' }),
        EditorView.domEventHandlers({ blur: () => { latest.current.onBlur?.(); return false } }),
      ] }),
      dispatchTransactions(transactions, editor) {
        const before = editor.state
        editor.update(transactions)
        if (transactions.some(transaction => transaction.docChanged && !transaction.annotation(fromProps))) latest.current.onChange(stateTemplate(editor.state))
        if (before.field(suggestionField) !== editor.state.field(suggestionField) || before.doc !== editor.state.doc) setRevision(revision => revision + 1)
      },
    })
    editor.dispatch({ ...setTemplateSpec(editor.state, value), annotations: [Transaction.addToHistory.of(false), fromProps.of(true)] })
    setView(editor)
    if (autoFocus) editor.focus()
    return () => editor.destroy()
  }, [listId, compartments])

  useEffect(() => {
    if (!view || templatesEqual(value, stateTemplate(view.state))) return
    view.dispatch({ ...setTemplateSpec(view.state, value), annotations: [Transaction.addToHistory.of(false), fromProps.of(true)] })
  }, [value, view])
  useEffect(() => { view?.dispatch({ effects: setVariables.of(variables) }) }, [variables, view])
  useEffect(() => {
    view?.dispatch({ effects: compartments.editable.reconfigure([EditorView.editable.of(!disabled), EditorState.readOnly.of(disabled)]) })
  }, [disabled, view, compartments])
  useEffect(() => {
    view?.dispatch({ effects: [
      compartments.attributes.reconfigure(EditorView.contentAttributes.of({
        ...(label ? { 'aria-label': label } : {}), ...(id ? { id } : {}), ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        'aria-invalid': String(!!invalid),
      })),
      compartments.placeholder.reconfigure(placeholder ? placeholderExtension(placeholder) : []),
    ] })
  }, [view, compartments, label, id, describedBy, invalid, placeholder])

  useImperativeHandle(ref, () => ({
    focus: () => view?.focus(),
    select: () => {
      if (!view) return
      view.focus()
      view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } })
    },
  }), [view])

  return <div ref={setFrame} className={cn('template-field relative min-w-0', className)} data-invalid={invalid || undefined} data-disabled={disabled || undefined}>
    <div ref={host} />
    <VariableSuggestionList view={view} listId={listId} container={frame} />
    {dialog}
  </div>
}
