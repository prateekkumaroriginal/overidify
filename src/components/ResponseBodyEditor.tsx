import { useDeferredValue, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, panels } from '@codemirror/view'
import { json } from '@codemirror/lang-json'
import { setDiagnostics } from '@codemirror/lint'
import { closeSearchPanel, openSearchPanel, search, searchPanelOpen } from '@codemirror/search'
import { analyzeResponseBody } from '../lib/response-editor'
import { ResponseEditorSession } from '../lib/response-editor-session'
import { responseCodeExtensions } from './response-code-extensions'
import { ResponseSearchPanel } from './ResponseSearchPanel'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog'
import { setVariables, TOKEN_CHAR } from '../lib/template-editor'
import type { TemplateText } from '../lib/templates'
import { closeSuggestionsOnEscape, createVariableHandler, templateViewExtensions } from './template-editor-view'
import { useVariables } from './variables-context'
import { VariableSuggestionList } from './VariableSuggestions'
import { useCreateVariableDialog } from './useCreateVariableDialog'

function isJsonText(text: string) {
  try { JSON.parse(text); return true } catch { return false }
}

function CodeView({ session, panelContainer, onView, disabled, listId }: { session: ResponseEditorSession; panelContainer: Compartment; onView: (view: EditorView | null) => void; disabled: boolean; listId: string }) {
  const host = useRef<HTMLDivElement>(null)
  const [frame, setFrame] = useState<HTMLDivElement | null>(null)
  const [view, setView] = useState<EditorView | null>(null)
  const searchHost = useRef<HTMLDivElement>(null)
  const [searchPanel, setSearchPanel] = useState<{ dom: HTMLElement; view: EditorView } | null>(null)
  useEffect(() => {
    const dom = document.createElement('div')
    // Rebind panels when moving between inline and expanded views, preserving search state.
    session.dispatch(session.state.update({ effects: panelContainer.reconfigure([
      panels({ bottomContainer: searchHost.current! }), search({ createPanel: () => ({ dom }) }),
    ]) }))
    const view = new EditorView({ parent: host.current!, state: session.state, dispatchTransactions: transactions => session.apply(transactions) })
    const unsubscribe = session.subscribe(transactions => view.update(transactions))
    onView(view)
    setView(view)
    setSearchPanel({ dom, view })
    return () => { unsubscribe(); onView(null); setView(null); view.destroy() }
  }, [session, panelContainer, onView])
  return <div className="min-w-0">
    <div ref={setFrame} className="relative"><div className="response-code-frame overflow-hidden rounded-md border bg-field"><div ref={host} /></div>
      <VariableSuggestionList view={view} listId={listId} container={frame} /></div>
    <div ref={searchHost} className="response-search-host" />
    {searchPanel && createPortal(<ResponseSearchPanel session={session} view={searchPanel.view} disabled={disabled} />, searchPanel.dom)}
  </div>
}

/** `resolvedBody` is the body with variables filled in, when it has variables that all exist. */
type Props = { value: TemplateText; onChange: (body: TemplateText) => void; onBlur: () => void; disabled: boolean; isJson: boolean; resolvedBody?: string }

export default function ResponseBodyEditor({ value, onChange, onBlur, disabled, isJson, resolvedBody }: Props) {
  const listId = useId()
  const { request, dialog } = useCreateVariableDialog()
  const [{ session, config }] = useState(() => {
    const config = responseCodeExtensions()
    return { config, session: new ResponseEditorSession(value, [config.extensions, templateViewExtensions(listId),
      createVariableHandler.of(request)]) }
  })
  const variables = useVariables()
  useEffect(() => { session.dispatch(session.state.update({ effects: setVariables.of(variables) })) }, [session, variables])
  const state = useSyncExternalStore(session.subscribe, () => session.state)
  const body = useMemo(() => state.doc.toString(), [state.doc])
  const deferredBody = useDeferredValue(body)
  const analysis = useMemo(() => analyzeResponseBody(deferredBody), [deferredBody])
  const hasVariables = body.includes(TOKEN_CHAR)
  const current = deferredBody === body
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState('')
  const viewRef = useRef<EditorView | null>(null)
  // A stable setter keeps the editor mounted across ordinary React renders.
  const [onView] = useState(() => (view: EditorView | null) => { viewRef.current = view })

  useEffect(() => session.subscribe(transactions => {
    if (transactions.some(transaction => transaction.docChanged)) onChange(session.template)
  }), [session, onChange])
  useEffect(() => { session.replace(value) }, [value, session])
  useEffect(() => {
    session.dispatch(session.state.update({ effects: config.editable.reconfigure([EditorView.editable.of(!disabled), EditorState.readOnly.of(disabled)]) }))
  }, [session, config, disabled])
  const expensiveFeatures = body.length <= 1_000_000
  useEffect(() => {
    session.dispatch(session.state.update({ effects: config.language.reconfigure(expensiveFeatures ? json() : []) }))
  }, [session, config, expensiveFeatures])
  useEffect(() => {
    // With variables, positions are only known for placeholders, so the filled-in body is checked instead.
    const diagnostic = current && isJson && !hasVariables ? analysis.error : undefined
    session.dispatch(session.state.update(setDiagnostics(session.state, diagnostic ? [{
      from: Math.min(diagnostic.offset, body.length), to: Math.min(diagnostic.offset + diagnostic.length, body.length), severity: 'error', message: diagnostic.message,
    }] : [])))
  }, [session, analysis, isJson, current, body.length, hasVariables])

  function run(action: () => void) {
    if (disabled) return
    try { action(); setError('') } catch (failure) { setError(`Change not applied. ${failure instanceof Error ? failure.message : 'Please try again.'}`) }
  }
  const editor = <div className="response-body-editor grid min-w-0 gap-3" data-expanded={expanded} onBlur={onBlur} onKeyDown={event => {
    // Let editor controls consume their shortcuts before form-level navigation.
    if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) event.stopPropagation()
    if (event.key === 'Escape') {
      if (expanded && !event.defaultPrevented) { event.preventDefault(); setExpanded(false) }
      event.stopPropagation()
    }
  }}>
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="secondary" size="sm" disabled={disabled || !current || !analysis.available} onClick={() => run(() => session.format())}>Format</Button>
      <Button type="button" variant="ghost-muted" size="sm" disabled={disabled || !session.canUndo} onClick={() => run(() => { session.undo() })}>Undo</Button>
      <Button type="button" variant="ghost-muted" size="sm" disabled={disabled || !session.canRedo} onClick={() => run(() => { session.redo() })}>Redo</Button>
      <Button type="button" variant="ghost-muted" size="sm" disabled={disabled} onClick={() => { if (viewRef.current) { openSearchPanel(viewRef.current) } }}>Search / replace</Button>
      {expanded ? <Button type="button" variant="secondary" size="sm" onClick={() => setExpanded(false)}>Return inline</Button> : <DialogTrigger asChild><Button type="button" variant="secondary" size="sm" disabled={disabled}>Expand editor</Button></DialogTrigger>}
    </div>
    <CodeView session={session} panelContainer={config.panelContainer} onView={onView} disabled={disabled} listId={listId} />
    {(!current || analysis.reason) && <p className="text-xs text-muted-foreground" role="status">
      {!current ? 'Checking JSON…' : hasVariables && analysis.error ? 'Format is unavailable where variables replace JSON keys or structure. Editing and saving remain available.'
        : isJson || !analysis.error ? analysis.reason : 'Format needs valid JSON. This response can still be edited and saved as text.'}
    </p>}
    {current && isJson && resolvedBody !== undefined && !isJsonText(resolvedBody) &&
      <p className="text-xs text-muted-foreground" role="status">With the current variable values, the body is not valid JSON. You can still save it.</p>}
    {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
  </div>
  return <Dialog open={expanded} onOpenChange={setExpanded}>
    {expanded ? <DialogContent className="max-w-[1200px]" onEscapeKeyDown={event => {
      event.stopPropagation()
      // Escape first closes open variable suggestions, keeping the expanded editor open.
      if (closeSuggestionsOnEscape(event)) { event.preventDefault(); return }
      // The dialog sees Escape before the panel's own keyboard handler.
      if (viewRef.current && searchPanelOpen(viewRef.current.state)) {
        event.preventDefault()
        closeSearchPanel(viewRef.current)
      }
    }} onCloseAutoFocus={event => {
      event.preventDefault(); requestAnimationFrame(() => viewRef.current?.focus())
    }}><DialogHeader><DialogTitle>Response body</DialogTitle><DialogDescription>Edit the same response in a larger view. Changes stay in your rule draft.</DialogDescription></DialogHeader>{editor}</DialogContent> : editor}
    {dialog}
  </Dialog>
}
