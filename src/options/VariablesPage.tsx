import { useEffect, useMemo, useRef, useState } from 'react'
import { Braces, Eye, EyeOff, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert'
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from '../components/ui/empty'
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog'
import { Icon } from '../components/Icon'
import { TemplateTextView } from '../components/TemplateText'
import { useVariables } from '../components/variables-context'
import { activateImportedRules } from '../lib/rule-transfer-storage'
import type { TransferActivation } from '../lib/rule-transfer-storage'
import { collectVariableReferences, NAME_DUPLICATE_MESSAGE, sortVariables, variableNameError } from '../lib/variables'
import type { ReferenceUsage, Variable } from '../lib/variables'
import { saveVariables, VariablesStorageError } from '../lib/variables-storage'
import type { NetworkRule } from '../lib/network-rules'
import type { RequestHeaderRule } from '../lib/types'
import { cn } from '../lib/utils'

const typeLabel = { 'header-rule': 'Header Rule', 'switch-rule': 'Switch Rule', 'network-rule': 'Network Rule' } as const
const routeOf = (usage: ReferenceUsage) => `#/${usage.type === 'network-rule' ? 'network-rules' : usage.type === 'switch-rule' ? 'switch-rules' : 'header-rules'}/${encodeURIComponent(usage.id)}`
const MASK = '••••••••'

function sameRows(left: Variable[], right: Variable[]) {
  if (left.length !== right.length) return false
  const byId = new Map(left.map(row => [row.id, row]))
  return right.every(row => byId.get(row.id)?.name === row.name && byId.get(row.id)?.value === row.value)
}

function UsedBy({ usages }: { usages: ReferenceUsage[] }) {
  if (!usages.length) return <span className="text-muted-foreground">Not used</span>
  return <Popover>
    <PopoverTrigger asChild><Button variant="link" size="inline" type="button">{usages.length} {usages.length === 1 ? 'rule' : 'rules'}</Button></PopoverTrigger>
    <PopoverContent align="start" className="w-80">
      <ul className="flex flex-col gap-2">
        {usages.map(usage => <li key={usage.id} className="flex flex-col gap-0.5">
          <a className="font-semibold underline-offset-2 hover:underline" href={routeOf(usage)}><TemplateTextView value={usage.name} /></a>
          <span className="text-muted-foreground">{typeLabel[usage.type]} · {usage.fields.join(', ')}</span>
        </li>)}
      </ul>
    </PopoverContent>
  </Popover>
}

export function VariablesPage({ requestHeaderRules, networkRules }: { requestHeaderRules: RequestHeaderRule[]; networkRules: NetworkRule[] }) {
  const stored = useVariables()
  // Shows the result of this page's own Save until storage reports it.
  const [justSaved, setJustSaved] = useState<{ from: Variable[] | null; variables: Variable[] } | null>(null)
  const saved = useMemo(() => justSaved && justSaved.from === stored ? justSaved.variables : stored ?? [], [justSaved, stored])
  // A null draft follows storage live. Saved values stay in use until Save.
  const [draft, setDraft] = useState<{ baseline: Variable[]; rows: Variable[] } | null>(null)
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set())
  const [touched, setTouched] = useState<Set<string>>(() => new Set())
  const [showAllErrors, setShowAllErrors] = useState(false)
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const [activation, setActivation] = useState<TransferActivation | null>(null)
  const [confirm, setConfirm] = useState<Map<string, ReferenceUsage[]> | null>(null)
  const nameInputs = useRef(new Map<string, HTMLInputElement>())
  const focusId = useRef<string | null>(null)
  const savedRows = useMemo(() => sortVariables(saved), [saved])
  const rows = draft?.rows ?? savedRows
  const baseline = draft?.baseline ?? saved
  const baselineById = useMemo(() => new Map(baseline.map(row => [row.id, row])), [baseline])
  const references = useMemo(() => collectVariableReferences({ requestHeaderRules, networkRules }), [requestHeaderRules, networkRules])
  const dirty = draft !== null

  const localErrors = useMemo(() => {
    const errors: Record<string, string> = {}
    const seen = new Set<string>()
    for (const row of rows) {
      const error = variableNameError(row.name) || (seen.has(row.name) ? NAME_DUPLICATE_MESSAGE : '')
      if (error) errors[row.id] = error
      seen.add(row.name)
    }
    return errors
  }, [rows])
  const errorFor = (id: string) => serverErrors[id] || ((showAllErrors || touched.has(id)) ? localErrors[id] : '')

  useEffect(() => {
    if (!focusId.current) return
    nameInputs.current.get(focusId.current)?.focus()
    focusId.current = null
  })

  function update(change: (rows: Variable[]) => Variable[]) {
    setDraft(current => {
      const base = current ?? { baseline: saved, rows: savedRows }
      const next = change(base.rows)
      return sameRows(base.baseline, next) ? null : { baseline: base.baseline, rows: next }
    })
    setFailure('')
  }

  function addRow(name = '') {
    const id = crypto.randomUUID()
    update(current => [...current, { id, name, value: '' }])
    setRevealed(current => new Set(current).add(id))
    focusId.current = id
  }

  function editRow(id: string, patch: Partial<Variable>) {
    update(current => current.map(row => row.id === id ? { ...row, ...patch } : row))
    if (patch.name !== undefined) setServerErrors(current => { const next = { ...current }; delete next[id]; return next })
  }

  function cancel() {
    setDraft(null); setServerErrors({}); setShowAllErrors(false); setTouched(new Set()); setFailure('')
  }

  async function save(confirmDeletes = false) {
    if (!draft || busy) return
    if (Object.keys(localErrors).length) {
      setShowAllErrors(true)
      nameInputs.current.get(rows.find(row => localErrors[row.id])!.id)?.focus()
      return
    }
    setBusy(true)
    setFailure('')
    try {
      const result = await saveVariables({ baseline: draft.baseline, draft: draft.rows, confirmDeletes })
      if (result.status === 'invalid') { setServerErrors(result.errors); setShowAllErrors(true); return }
      if (result.status === 'confirm') { setConfirm(result.missing); return }
      setConfirm(null)
      setJustSaved({ from: stored, variables: result.variables })
      setDraft(null); setServerErrors({}); setShowAllErrors(false); setTouched(new Set())
      showActivation(result.activation)
    } catch (error) {
      setConfirm(null)
      setFailure(error instanceof VariablesStorageError ? error.message : new VariablesStorageError().message)
    } finally { setBusy(false) }
  }

  function showActivation(result: TransferActivation) {
    if (!result.ok) { setActivation(result); return }
    setActivation(null)
    toast.success('Variables saved', result.reloadTabIds.length ? { description: 'Settings saved. Reload matching website tabs to activate the latest network rules.', duration: Infinity } : undefined)
  }

  async function retryActivation() {
    setBusy(true)
    try { showActivation(await activateImportedRules()) }
    finally { setBusy(false) }
  }

  const saveRef = useRef(save)
  useEffect(() => { saveRef.current = save })
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.key !== 'Enter' || !event.ctrlKey) return
      event.preventDefault()
      if (!event.repeat) void saveRef.current()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const names = new Set(rows.map(row => row.name))
  const missing = [...references].filter(([name]) => !saved.some(row => row.name === name) && !names.has(name))

  return <section className="mx-auto max-w-[960px] animate-rise-in" aria-labelledby="variables-title">
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex items-center gap-3">
          <h1 id="variables-title" className="text-xl font-semibold">Variables</h1>
          {dirty && <span className="rounded-full border border-input px-2 py-0.5 text-[11px] text-muted-foreground" role="status">Unsaved changes</span>}
        </div>
        <p className="text-xs text-muted-foreground">Type {'{{'} in any rule field to insert a variable. Values stay in this browser and are never exported.</p>
      </div>
      <Button type="button" onClick={() => addRow()} disabled={busy}><Icon icon={Plus} data-icon="inline-start" />Add variable</Button>
    </div>
    {failure && <Alert variant="destructive" className="mb-5"><AlertDescription>{failure}</AlertDescription></Alert>}
    {activation && <Alert className="mb-5"><AlertTitle>Variables were saved, but the browser has not applied them yet.</AlertTitle><AlertDescription>
      {activation.error && <p>{activation.error}</p>}
      {activation.reloadTabIds.length > 0 && <p>Reload matching website tabs to activate the latest network rules.</p>}
      <Button className="mt-2" variant="outline" size="sm" type="button" disabled={busy} onClick={() => { void retryActivation() }}>{busy ? 'Applying…' : 'Retry activation'}</Button>
    </AlertDescription></Alert>}
    {!rows.length ? <Empty className="min-h-[280px] border">
      <EmptyHeader>
        <EmptyMedia variant="icon"><Icon icon={Braces} /></EmptyMedia>
        <EmptyTitle role="heading" aria-level={2}>No variables</EmptyTitle>
      </EmptyHeader>
      <EmptyContent><Button type="button" onClick={() => addRow()} disabled={busy}><Icon icon={Plus} data-icon="inline-start" />Add variable</Button></EmptyContent>
    </Empty> : <div className="rounded-lg border bg-card shadow-panel">
      <Table containerClassName="rounded-lg">
        <TableHeader><TableRow interactive={false}>
          <TableHead className="w-[30%]">Name</TableHead><TableHead>Value</TableHead><TableHead className="w-[120px]">Used by</TableHead><TableHead className="w-[84px]"><span className="sr-only">Actions</span></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.map(row => {
            const base = baselineById.get(row.id)
            const error = errorFor(row.id)
            const shown = revealed.has(row.id)
            const usages = references.get(base?.name ?? row.name) ?? []
            const renamedCount = base && base.name !== row.name ? usages.reduce((total, usage) => total + usage.count, 0) : 0
            return <TableRow key={row.id} interactive={false} className="align-top">
              <TableCell className="whitespace-normal">
                <Input ref={element => { if (element) nameInputs.current.set(row.id, element); else nameInputs.current.delete(row.id) }}
                  className="font-mono text-[11px]" aria-label="Variable name" value={row.name} spellCheck={false} autoComplete="off" disabled={busy}
                  aria-invalid={!!error} aria-describedby={error || renamedCount ? `${row.id}-name-note` : undefined}
                  onChange={event => editRow(row.id, { name: event.target.value })}
                  onBlur={() => setTouched(current => new Set(current).add(row.id))} />
                {(error || renamedCount > 0) && <p id={`${row.id}-name-note`} className={cn('mt-1.5 text-[11px]', error ? 'text-destructive' : 'text-muted-foreground')}>
                  {error || `Updates ${renamedCount} ${renamedCount === 1 ? 'reference' : 'references'} on Save.`}
                </p>}
              </TableCell>
              <TableCell className="whitespace-normal">
                {shown ? <textarea aria-label={`Value of ${row.name || 'new variable'}`} rows={1} value={row.value} spellCheck={false} disabled={busy}
                  className="field-sizing-content min-h-[38px] w-full resize-none rounded-md border border-input bg-field px-3 py-[10px] font-mono text-[11px] text-foreground focus:border-ring focus:ring-3 focus:ring-ring/15 focus:outline-none"
                  onChange={event => editRow(row.id, { value: event.target.value })} />
                  : <span className={cn('inline-block py-[10px] font-mono text-[11px]', !row.value && 'text-muted-foreground italic')} aria-label={row.value ? 'Hidden value' : 'Empty value'}>{row.value ? MASK : 'Empty'}</span>}
              </TableCell>
              <TableCell className="py-[18px] whitespace-normal"><UsedBy usages={usages} /></TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  <Button variant="ghost-muted" size="icon-sm" type="button" aria-label={`${shown ? 'Hide' : 'Reveal'} value of ${row.name || 'new variable'}`} aria-pressed={shown}
                    onClick={() => setRevealed(current => { const next = new Set(current); if (shown) next.delete(row.id); else next.add(row.id); return next })}>
                    <Icon icon={shown ? EyeOff : Eye} />
                  </Button>
                  <Button variant="destructive-ghost" size="icon-sm" type="button" disabled={busy} aria-label={`Delete ${row.name || 'new variable'}`}
                    onClick={() => { update(current => current.filter(item => item.id !== row.id)); setRevealed(current => { const next = new Set(current); next.delete(row.id); return next }) }}>
                    <Icon icon={Trash2} />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          })}
        </TableBody>
      </Table>
    </div>}
    {missing.length > 0 && <section className="mt-6 rounded-lg border border-destructive/40 bg-destructive/5 p-5" aria-labelledby="missing-variables">
      <h2 id="missing-variables" className="mb-1 text-[13px] font-bold">Referenced but missing</h2>
      <p className="mb-3 text-xs text-muted-foreground">Rules using these names stay inactive until a variable with the same name is saved.</p>
      <ul className="flex flex-col gap-2">
        {missing.map(([name, usages]) => <li key={name} className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="flex items-center gap-2"><code className="font-mono">{name}</code><span className="text-muted-foreground">{usages.length} {usages.length === 1 ? 'rule' : 'rules'}</span></span>
          <Button variant="outline" size="sm" type="button" disabled={busy} onClick={() => addRow(name)}>Create</Button>
        </li>)}
      </ul>
    </section>}
    <div className="mt-6 mb-10 flex items-center gap-2">
      <Button variant="ghost" type="button" className="ml-auto" disabled={busy || !dirty} onClick={cancel}>Cancel</Button>
      <Button type="button" disabled={busy || !dirty} onClick={() => { void save() }}>{busy ? 'Saving…' : 'Save'}</Button>
    </div>
    <AlertDialog open={confirm !== null} onOpenChange={open => { if (!open && !busy) setConfirm(null) }}>
      <AlertDialogContent className="max-h-[calc(100dvh_-_2rem)] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete referenced variables?</AlertDialogTitle>
          <AlertDialogDescription>These rules keep their references and stay inactive until a variable with the same name is saved again.</AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="flex flex-col gap-3 text-xs">
          {[...confirm ?? []].map(([name, usages]) => <li key={name}>
            <code className="font-mono font-semibold">{name}</code>
            <ul className="mt-1 flex flex-col gap-0.5 pl-3 text-muted-foreground">
              {usages.map(usage => <li key={usage.id}><TemplateTextView value={usage.name} /> · {usage.fields.join(', ')}</li>)}
            </ul>
          </li>)}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={busy} onClick={event => { event.preventDefault(); void save(true) }}>Delete and save</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>
}
