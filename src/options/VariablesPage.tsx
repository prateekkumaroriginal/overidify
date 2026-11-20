import { useEffect, useMemo, useRef, useState } from 'react'
import { Braces, CircleHelp, Eye, EyeOff, Plus, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Switch } from '../components/ui/switch'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert'
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from '../components/ui/empty'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog'
import { Icon } from '../components/Icon'
import { useVariables } from '../components/variables-context'
import { ruleTemplateFields } from '../lib/rule-resolution'
import { activateImportedRules } from '../lib/rule-transfer-storage'
import type { TransferActivation } from '../lib/rule-transfer-storage'
import { templateTokens } from '../lib/templates'
import { countFieldUsage, findVariable, indexVariables, NAME_DUPLICATE_MESSAGE, nameKey, sortVariables, variableNameError } from '../lib/variables'
import type { Variable } from '../lib/variables'
import type { TurnedOffRule } from '../lib/variables-save'
import { saveVariables, VARIABLES_SAVE_FAILED } from '../lib/variables-page-storage'
import type { NetworkRule } from '../lib/network-rules'
import type { RequestHeaderRule } from '../lib/types'
import { cn } from '../lib/utils'

const typeLabel = { 'header-rule': 'Header Rule', 'switch-rule': 'Switch Rule', 'network-rule': 'Network Rule' } as const
const USAGE_HELP = 'How many rule fields use this variable. Deleting a variable in use turns those rules off.'
const grid = 'grid grid-cols-[minmax(150px,1fr)_minmax(180px,1.35fr)_64px_52px_30px] gap-x-3 mobile:grid-cols-[minmax(0,1fr)_auto_auto]'

const sameRows = (left: Variable[], right: Variable[]) => left.length === right.length &&
  right.every(row => { const other = left.find(item => item.id === row.id); return !!other && other.name === row.name && other.value === row.value && other.secret === row.secret })

export function VariablesPage({ requestHeaderRules, networkRules }: { requestHeaderRules: RequestHeaderRule[]; networkRules: NetworkRule[] }) {
  const loaded = useVariables()
  const stored = useMemo(() => sortVariables(loaded ?? []), [loaded])
  // A null draft follows the saved list live. Saved values stay in use until Save.
  const [draft, setDraft] = useState<{ baseline: Variable[]; rows: Variable[] } | null>(null)
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set())
  const [touched, setTouched] = useState<Set<string>>(() => new Set())
  const [showErrors, setShowErrors] = useState(false)
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const [activation, setActivation] = useState<TransferActivation | null>(null)
  // The list stays while the dialog animates closed.
  const [confirm, setConfirm] = useState<{ open: boolean; rules: TurnedOffRule[] }>({ open: false, rules: [] })
  const nameInputs = useRef(new Map<string, HTMLInputElement>())
  const focusId = useRef<string | null>(null)
  const rows = draft?.rows ?? stored
  const dirty = draft !== null

  const fields = useMemo(() => [...requestHeaderRules, ...networkRules].flatMap(ruleTemplateFields), [requestHeaderRules, networkRules])
  const usage = useMemo(() => countFieldUsage(fields, rows), [fields, rows])
  const missing = useMemo(() => {
    const index = indexVariables(rows)
    const names = new Map<string, string>()
    for (const token of fields.flatMap(templateTokens)) if (!findVariable(token, index)) names.set(nameKey(token.name), token.name)
    return [...names.values()].sort()
  }, [fields, rows])

  const localErrors = useMemo(() => {
    const errors: Record<string, string> = {}
    const seen = new Set<string>()
    for (const row of rows) {
      const error = variableNameError(row.name) || (seen.has(nameKey(row.name)) ? NAME_DUPLICATE_MESSAGE : '')
      if (error) errors[row.id] = error
      seen.add(nameKey(row.name))
    }
    return errors
  }, [rows])
  const errorFor = (id: string) => serverErrors[id] || (showErrors || touched.has(id) ? localErrors[id] : '')

  useEffect(() => {
    if (!focusId.current) return
    nameInputs.current.get(focusId.current)?.focus()
    focusId.current = null
  })

  function update(change: (rows: Variable[]) => Variable[]) {
    setDraft(current => {
      const base = current ?? { baseline: stored, rows: stored }
      const next = change(base.rows)
      return sameRows(base.baseline, next) ? null : { baseline: base.baseline, rows: next }
    })
    setFailure('')
  }
  function addRow(name = '') {
    const id = crypto.randomUUID()
    update(current => [...current, { id, name, value: '', secret: false }])
    setQuery('')
    focusId.current = id
  }
  function editRow(id: string, patch: Partial<Variable>) {
    update(current => current.map(row => row.id === id ? { ...row, ...patch } : row))
    if (patch.name !== undefined) setServerErrors(current => { const next = { ...current }; delete next[id]; return next })
  }
  function cancel() {
    setDraft(null); setServerErrors({}); setShowErrors(false); setTouched(new Set()); setFailure(''); setRevealed(new Set())
  }

  async function save(confirmedTurnOff: string[] = []) {
    if (!draft || busy) return
    if (Object.keys(localErrors).length) {
      setShowErrors(true)
      nameInputs.current.get(rows.find(row => localErrors[row.id])!.id)?.focus()
      return
    }
    setBusy(true)
    setFailure('')
    try {
      const result = await saveVariables({ baseline: draft.baseline, draft: draft.rows, confirmedTurnOff })
      if (result.status === 'invalid') { setServerErrors(result.errors); setShowErrors(true); return }
      if (result.status === 'confirm') { setConfirm({ open: true, rules: result.turnedOff }); return }
      setConfirm(current => ({ ...current, open: false }))
      cancel()
      showActivation(result.activation, result.turnedOff.length)
    } catch {
      setConfirm(current => ({ ...current, open: false }))
      setFailure(VARIABLES_SAVE_FAILED)
    } finally { setBusy(false) }
  }

  function showActivation(result: TransferActivation, turnedOff = 0) {
    if (!result.ok) { setActivation(result); return }
    setActivation(null)
    const description = [turnedOff ? `${turnedOff} ${turnedOff === 1 ? 'rule was' : 'rules were'} turned off.` : '',
      result.reloadTabIds.length ? 'Reload matching website tabs to activate the latest network rules.' : ''].filter(Boolean).join(' ')
    toast.success('Variables saved', description ? { description } : undefined)
  }

  async function retryActivation() {
    setBusy(true)
    try { showActivation(await activateImportedRules()) } finally { setBusy(false) }
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

  const one = confirm.rules.length === 1
  const term = nameKey(query.trim())
  const visible = term ? rows.filter(row => nameKey(row.name).includes(term)) : rows

  return <TooltipProvider delayDuration={250}><section className="mx-auto max-w-[960px] animate-rise-in" aria-labelledby="variables-title">
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex items-center gap-3">
          <h1 id="variables-title" className="text-xl font-semibold">Variables</h1>
          {dirty && <span className="rounded-full border border-input px-2 py-0.5 text-[11px] text-muted-foreground" role="status">Unsaved changes</span>}
        </div>
        <p className="text-xs text-muted-foreground">Type {'{{'} in any rule field to insert a variable. Exports include variable names, never values.</p>
      </div>
      <Button type="button" onClick={() => addRow()} disabled={busy}><Icon icon={Plus} data-icon="inline-start" />New variable</Button>
    </div>
    {failure && <Alert variant="destructive" className="mb-5"><AlertDescription>{failure}</AlertDescription></Alert>}
    {activation && <Alert className="mb-5"><AlertTitle>Variables were saved, but the browser has not applied them yet.</AlertTitle><AlertDescription>
      {activation.error && <p>{activation.error}</p>}
      <Button className="mt-2" variant="outline" size="sm" type="button" disabled={busy} onClick={() => { void retryActivation() }}>{busy ? 'Applying…' : 'Retry activation'}</Button>
    </AlertDescription></Alert>}
    {!rows.length ? <Empty className="min-h-[280px] border">
      <EmptyHeader>
        <EmptyMedia variant="icon"><Icon icon={Braces} /></EmptyMedia>
        <EmptyTitle role="heading" aria-level={2}>No variables yet</EmptyTitle>
      </EmptyHeader>
      <EmptyContent><Button type="button" onClick={() => addRow()} disabled={busy}><Icon icon={Plus} data-icon="inline-start" />New variable</Button></EmptyContent>
    </Empty> : <div className="rounded-lg border bg-card px-6 py-5 shadow-panel mobile:px-4">
      <label className="relative mb-4 block max-w-80">
        <Icon icon={Search} size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
        <Input className="h-[30px] py-0 pl-8" aria-label="Search variables" placeholder="Find a variable..." value={query} onChange={event => setQuery(event.target.value)} />
      </label>
      <div className={cn(grid, 'border-b pb-2 text-[11px] font-semibold text-muted-foreground mobile:hidden')} role="presentation">
        <span>Name</span><span>Value</span>
        <span className="flex items-center justify-center gap-1">Usage
          <Tooltip><TooltipTrigger asChild><span tabIndex={0} role="img" aria-label={`Usage: ${USAGE_HELP}`} className="inline-flex cursor-help rounded-full outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring">
            <Icon icon={CircleHelp} size={13} /></span></TooltipTrigger>
            <TooltipContent className="max-w-60">{USAGE_HELP}</TooltipContent></Tooltip>
        </span>
        <span className="text-center">Secret</span><span />
      </div>
      <ul aria-label="Variables" className="flex flex-col">
        {visible.map(row => {
          const error = errorFor(row.id)
          const shown = !row.secret || revealed.has(row.id)
          const count = usage.get(row.id) ?? 0
          const label = row.name || 'new variable'
          return <li key={row.id} className={cn(grid, 'items-start gap-y-2 border-b py-2.5 last:border-b-0')}>
            <div className="min-w-0 mobile:col-span-3">
              <Input ref={element => { if (element) nameInputs.current.set(row.id, element); else nameInputs.current.delete(row.id) }}
                className="font-mono text-[11px]" aria-label="Variable name" value={row.name} spellCheck={false} autoComplete="off" disabled={busy}
                aria-invalid={!!error} aria-describedby={error ? `${row.id}-error` : undefined}
                onChange={event => editRow(row.id, { name: event.target.value })}
                onBlur={() => setTouched(current => new Set(current).add(row.id))} />
              {error && <p id={`${row.id}-error`} className="mt-1.5 text-[11px] text-destructive">{error}</p>}
            </div>
            <div className="relative min-w-0 mobile:col-span-3">
              <Input className={cn('font-mono text-[11px]', row.secret && 'pr-9')} type={shown ? 'text' : 'password'} aria-label={`Value of ${label}`}
                value={row.value} spellCheck={false} autoComplete="off" disabled={busy} onChange={event => editRow(row.id, { value: event.target.value })} />
              {row.secret && <Button variant="ghost-muted" size="icon-sm" type="button" className="absolute top-1/2 right-1.5 -translate-y-1/2"
                aria-label={`${shown ? 'Hide' : 'Show'} value of ${label}`} aria-pressed={shown}
                onClick={() => setRevealed(current => { const next = new Set(current); if (shown) next.delete(row.id); else next.add(row.id); return next })}>
                <Icon icon={shown ? EyeOff : Eye} />
              </Button>}
            </div>
            <span className={cn('flex h-[38px] items-center justify-center text-xs font-semibold tabular-nums mobile:justify-start', !count && 'text-muted-foreground')}
              title={`Used in ${count} rule ${count === 1 ? 'field' : 'fields'}`} aria-label={`Usage: ${count}`}>{count}</span>
            <span className="flex h-[38px] items-center justify-center">
              <Switch checked={row.secret} disabled={busy} aria-label={`Secret: ${label}`} title="Secret"
                onCheckedChange={secret => { editRow(row.id, { secret }); setRevealed(current => { const next = new Set(current); next.delete(row.id); return next }) }} />
            </span>
            <span className="flex h-[38px] items-center justify-center">
              <Button variant="destructive-ghost" size="icon-sm" type="button" disabled={busy} aria-label={`Delete ${label}`}
                onClick={() => update(current => current.filter(item => item.id !== row.id))}>
                <Icon icon={Trash2} />
              </Button>
            </span>
          </li>
        })}
      </ul>
      {!visible.length && <p className="py-6 text-center text-xs text-muted-foreground">No variables match.</p>}
    </div>}
    {missing.length > 0 && <section className="mt-6 rounded-lg border border-destructive/40 bg-destructive/5 p-5" aria-labelledby="missing-variables">
      <h2 id="missing-variables" className="mb-1 text-[13px] font-bold">Used but missing</h2>
      <p className="mb-3 text-xs text-muted-foreground">Rules use these names, but no variable has them. Those rules stay off until the variable exists and you turn them on.</p>
      <ul className="flex flex-col gap-2">
        {missing.map(name => <li key={name} className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <code className="font-mono">{name}</code>
          <Button variant="outline" size="sm" type="button" disabled={busy} onClick={() => addRow(name)}>Create</Button>
        </li>)}
      </ul>
    </section>}
    <div className="mt-6 mb-10 flex items-center gap-2">
      <Button variant="ghost" type="button" className="ml-auto" disabled={busy || !dirty} onClick={cancel}>Cancel</Button>
      <Button type="button" disabled={busy || !dirty} onClick={() => { void save() }}>{busy ? 'Saving…' : 'Save'}</Button>
    </div>
    <AlertDialog open={confirm.open} onOpenChange={open => { if (!open && !busy) setConfirm(current => ({ ...current, open: false })) }}>
      <AlertDialogContent className="max-h-[calc(100dvh_-_2rem)] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Turn off {one ? 'this rule' : 'these rules'}?</AlertDialogTitle>
          <AlertDialogDescription>With these variables, {one ? 'this rule' : 'these rules'} can't run. Saving turns {one ? 'it' : 'them'} off. Turn {one ? 'it' : 'them'} back on after fixing the variables.</AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="flex flex-col gap-1 text-xs">
          {confirm.rules.map(rule => <li key={rule.id}><span className="font-semibold">{rule.name}</span> <span className="text-muted-foreground">· {typeLabel[rule.type]}</span></li>)}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={busy} onClick={event => { event.preventDefault(); void save(confirm.rules.map(rule => rule.id)) }}>Save and turn off</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section></TooltipProvider>
}
