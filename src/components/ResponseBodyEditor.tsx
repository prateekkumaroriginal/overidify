import { useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { json } from '@codemirror/lang-json'
import { setDiagnostics } from '@codemirror/lint'
import { openSearchPanel } from '@codemirror/search'
import { analyzeResponseBody } from '../lib/response-editor'
import type { TreeEdit } from '../lib/response-editor'
import { ResponseEditorSession } from '../lib/response-editor-session'
import { readResponseEditorMode, saveResponseEditorMode } from '../lib/response-editor-preference'
import type { ResponseEditorMode } from '../lib/response-editor-preference'
import { responseCodeExtensions } from './response-code-extensions'
import { ResponseTree } from './ResponseTree'
import { Button } from './ui/button'
import { Tabs, TabsList, TabsTrigger } from './ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog'

function CodeView({ session, onView }: { session: ResponseEditorSession; onView: (view: EditorView | null) => void }) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const view = new EditorView({ parent: host.current!, state: session.state, dispatchTransactions: transactions => session.apply(transactions) })
    const unsubscribe = session.subscribe(transactions => view.update(transactions))
    onView(view)
    return () => { unsubscribe(); onView(null); view.destroy() }
  }, [session, onView])
  return <div ref={host} />
}

type Props = { value: string; onChange: (body: string) => void; onBlur: () => void; disabled: boolean; isJson: boolean }

export default function ResponseBodyEditor({ value, onChange, onBlur, disabled, isJson }: Props) {
  const [{ session, config }] = useState(() => {
    const config = responseCodeExtensions()
    return { config, session: new ResponseEditorSession(value, config.extensions) }
  })
  const state = useSyncExternalStore(session.subscribe, () => session.state)
  const body = useMemo(() => state.doc.toString(), [state.doc])
  const [mode, setMode] = useState<ResponseEditorMode>(() => readResponseEditorMode(localStorage, analyzeResponseBody(value).available))
  const deferredBody = useDeferredValue(body)
  // Tree actions need an aligned body and AST without unmounting expanded branches.
  const analysisBody = mode === 'tree' ? body : deferredBody
  const analysis = useMemo(() => analyzeResponseBody(analysisBody), [analysisBody])
  const current = analysisBody === body
  const activeMode = mode === 'tree' && analysis.available && current ? 'tree' : 'code'
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState('')
  const failedEdit = useRef(false)
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
    if (disabled) return false
    try { action(); if (!analyzeResponseBody(session.body).available) setMode('code'); failedEdit.current = false; setError(''); return true } catch (failure) { failedEdit.current = true; setError(`Change not applied. ${failure instanceof Error ? failure.message : 'Please try again.'}`); return false }
  }
  function edit(operation: TreeEdit | (() => TreeEdit)) { return run(() => session.editTree(typeof operation === 'function' ? operation() : operation)) }
  function selectMode(next: string) {
    if (disabled || (next === 'tree' && (!current || !analysis.available))) return
    setMode(next as ResponseEditorMode)
    saveResponseEditorMode(localStorage, next as ResponseEditorMode)
  }
  const editor = <div className="response-body-editor grid min-w-0 gap-3" data-expanded={expanded} onBlur={onBlur} onKeyDown={event => {
    // Let editor controls consume their shortcuts before form-level navigation.
    if (event.key === 'Enter') {
      if (activeMode === 'tree' && event.target instanceof HTMLInputElement) {
        failedEdit.current = false
        event.target.blur()
        if (failedEdit.current) { event.preventDefault(); event.stopPropagation() }
      }
      if (!event.ctrlKey && !event.metaKey) {
        if (activeMode === 'tree' && event.target instanceof HTMLInputElement) event.preventDefault()
        event.stopPropagation()
      }
    }
    if (event.key === 'Escape') {
      if (expanded && !event.defaultPrevented) { event.preventDefault(); setExpanded(false) }
      event.stopPropagation()
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && activeMode === 'tree') {
      event.preventDefault(); event.stopPropagation(); run(() => { if (event.shiftKey) session.redo(); else session.undo() })
    }
  }}>
    <div className="flex flex-wrap items-center gap-2">
      <Tabs value={activeMode} onValueChange={selectMode}><TabsList aria-label="Response editing mode"><TabsTrigger value="code" disabled={disabled}>Code</TabsTrigger><TabsTrigger value="tree" disabled={disabled || !current || !analysis.available} aria-describedby="response-editor-availability">Tree</TabsTrigger></TabsList></Tabs>
      <Button type="button" variant="secondary" size="sm" disabled={disabled || !current || !analysis.available} onClick={() => run(() => session.format())}>Format</Button>
      <Button type="button" variant="ghost-muted" size="sm" disabled={disabled || !session.canUndo} onClick={() => run(() => { session.undo() })}>Undo</Button>
      <Button type="button" variant="ghost-muted" size="sm" disabled={disabled || !session.canRedo} onClick={() => run(() => { session.redo() })}>Redo</Button>
      {activeMode === 'code' && <Button type="button" variant="ghost-muted" size="sm" disabled={disabled} onClick={() => { if (viewRef.current) { openSearchPanel(viewRef.current) } }}>Search / replace</Button>}
      {expanded ? <Button type="button" variant="secondary" size="sm" onClick={() => setExpanded(false)}>Return inline</Button> : <DialogTrigger asChild><Button type="button" variant="secondary" size="sm" disabled={disabled}>Expand editor</Button></DialogTrigger>}
    </div>
    <div className="min-w-0 overflow-hidden rounded-md border bg-field">
      <div hidden={activeMode !== 'code'}><CodeView session={session} onView={onView} /></div>
      {activeMode === 'tree' && analysis.root && <div className="response-tree overflow-auto p-3"><p className="mb-2 text-xs text-muted-foreground">Strings and property names use JSON quotes and escapes, for example &quot;Ada&quot;.</p><ResponseTree node={analysis.root} path={[]} body={body} disabled={disabled} edit={edit} /></div>}
    </div>
    <p id="response-editor-availability" className="text-xs text-muted-foreground" role="status">
      {!current ? 'Checking JSON…' : analysis.reason ? (isJson || !analysis.error ? analysis.reason : 'Tree and Format need valid JSON. This response can still be edited and saved as text.') : 'Tree edits may rewrite formatting. Switching modes preserves the exact text.'}
    </p>
    {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
  </div>
  return <Dialog open={expanded} onOpenChange={setExpanded}>
    {expanded ? <DialogContent className="max-w-[1200px]" onEscapeKeyDown={event => { event.stopPropagation() }} onCloseAutoFocus={event => {
      event.preventDefault(); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-response-body] [role=tab][data-state=active]')?.focus())
    }}><DialogHeader><DialogTitle>Response body</DialogTitle><DialogDescription>Edit the same response in a larger view. Changes stay in your rule draft.</DialogDescription></DialogHeader>{editor}</DialogContent> : editor}
  </Dialog>
}
