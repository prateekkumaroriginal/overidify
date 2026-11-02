import { useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
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

function CodeView({ session, panelContainer, onView, disabled }: { session: ResponseEditorSession; panelContainer: Compartment; onView: (view: EditorView | null) => void; disabled: boolean }) {
  const host = useRef<HTMLDivElement>(null)
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
    setSearchPanel({ dom, view })
    return () => { unsubscribe(); onView(null); view.destroy() }
  }, [session, panelContainer, onView])
  return <div className="min-w-0">
    <div className="response-code-frame overflow-hidden rounded-md border bg-field"><div ref={host} /></div>
    <div ref={searchHost} className="response-search-host" />
    {searchPanel && createPortal(<ResponseSearchPanel session={session} view={searchPanel.view} disabled={disabled} />, searchPanel.dom)}
  </div>
}

type Props = { value: string; onChange: (body: string) => void; onBlur: () => void; disabled: boolean; isJson: boolean }

export default function ResponseBodyEditor({ value, onChange, onBlur, disabled, isJson }: Props) {
  const [{ session, config }] = useState(() => {
    const config = responseCodeExtensions()
    return { config, session: new ResponseEditorSession(value, config.extensions) }
  })
  const state = useSyncExternalStore(session.subscribe, () => session.state)
  const body = useMemo(() => state.doc.toString(), [state.doc])
  const deferredBody = useDeferredValue(body)
  const analysis = useMemo(() => analyzeResponseBody(deferredBody), [deferredBody])
  const current = deferredBody === body
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState('')
  const viewRef = useRef<EditorView | null>(null)
  // A stable setter keeps the editor mounted across ordinary React renders.
  const [onView] = useState(() => (view: EditorView | null) => { viewRef.current = view })

  useEffect(() => session.subscribe(transactions => {
    if (transactions.some(transaction => transaction.docChanged)) onChange(session.body)
  }), [session, onChange])
  useEffect(() => { if (value !== session.body) session.replace(value) }, [value, session])
  useEffect(() => {
    session.dispatch(session.state.update({ effects: config.editable.reconfigure([EditorView.editable.of(!disabled), EditorState.readOnly.of(disabled)]) }))
  }, [session, config, disabled])
  const expensiveFeatures = body.length <= 1_000_000
  useEffect(() => {
    session.dispatch(session.state.update({ effects: config.language.reconfigure(expensiveFeatures ? json() : []) }))
  }, [session, config, expensiveFeatures])
  useEffect(() => {
    const diagnostic = current && isJson ? analysis.error : undefined
    session.dispatch(session.state.update(setDiagnostics(session.state, diagnostic ? [{
      from: Math.min(diagnostic.offset, body.length), to: Math.min(diagnostic.offset + diagnostic.length, body.length), severity: 'error', message: diagnostic.message,
    }] : [])))
  }, [session, analysis, isJson, current, body.length])

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
    <CodeView session={session} panelContainer={config.panelContainer} onView={onView} disabled={disabled} />
    {(!current || analysis.reason) && <p className="text-xs text-muted-foreground" role="status">
      {!current ? 'Checking JSON…' : isJson || !analysis.error ? analysis.reason : 'Format needs valid JSON. This response can still be edited and saved as text.'}
    </p>}
    {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
  </div>
  return <Dialog open={expanded} onOpenChange={setExpanded}>
    {expanded ? <DialogContent className="max-w-[1200px]" onEscapeKeyDown={event => {
      event.stopPropagation()
      // The dialog sees Escape before the panel's own keyboard handler.
      if (viewRef.current && searchPanelOpen(viewRef.current.state)) {
        event.preventDefault()
        closeSearchPanel(viewRef.current)
      }
    }} onCloseAutoFocus={event => {
      event.preventDefault(); requestAnimationFrame(() => viewRef.current?.focus())
    }}><DialogHeader><DialogTitle>Response body</DialogTitle><DialogDescription>Edit the same response in a larger view. Changes stay in your rule draft.</DialogDescription></DialogHeader>{editor}</DialogContent> : editor}
  </Dialog>
}
