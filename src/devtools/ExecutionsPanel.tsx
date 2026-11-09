import { getDomainPatterns } from '../lib/pattern'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { Activity, Check, ChevronDown, ChevronRight, ChevronUp, CircleAlert, Copy, PanelLeftClose, PanelLeftOpen, Pause, Play, Search, Trash2, X } from 'lucide-react'
import { EXECUTION_HISTORY_BYTES, type ExecutionRecord, type ExecutionSnapshot, type RequestObservation } from '../lib/execution-history'
import type { ExecutionController } from './executions'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '../components/ui/empty'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Separator } from '../components/ui/separator'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Label } from '../components/ui/label'
import { Input } from '../components/ui/input'
import { MemoryUsage } from './MemoryUsage'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip'
import { Icon } from '../components/Icon'
import { cn } from '../lib/utils'
import { capturedCodeLines, decorateCapturedCode, findCapturedText, highlightCapturedJson, previewCapturedCode, type CapturedCodePart } from '../lib/captured-code'

const empty: ExecutionSnapshot = { records: [], observations: [], bytes: 0, removed: 0, paused: false, notice: '' }
const getEmpty = () => empty
const subscribeEmpty = () => () => undefined
const ruleType = { 'header-rule': 'Header', 'switch-rule': 'Switch', 'network-rule': 'Network' }
const resultMeaning = {
  Mocked: 'The page interceptor reported a response supplied by the Network rule. Page scripts can alter these reports.',
  Matched: 'Chrome confirmed a Header or Switch rule match. Applied values were not captured.',
  Failed: 'The page interceptor reported an error. Page scripts can alter these reports. See the execution details for the reason.',
}
const listPreferenceKey = 'overidify:executions-list:v1'
const clockTime = (time: number) => new Date(time).toLocaleTimeString(undefined, { hour12: false })
const calendarTime = (time: number) => `${new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}, ${clockTime(time)}`

function RuleKind({ kind }: { kind: ExecutionRecord['rule']['kind'] }) {
  return <Badge variant="outline" aria-label={`Rule type: ${ruleType[kind]}`}>{ruleType[kind]}</Badge>
}

function Result({ record, explain = false }: { record: ExecutionRecord; explain?: boolean }) {
  const badge = <Badge variant="execution" className={explain ? 'items-baseline [&>svg]:self-center' : undefined} data-result={record.result} tabIndex={explain ? 0 : undefined}>{record.result === 'Mocked' ? <Icon icon={Check} size={12} /> : record.result === 'Failed' ? <Icon icon={CircleAlert} size={12} /> : null}{record.result === 'Matched' ? 'Rule matched' : record.result}</Badge>
  return explain ? <Tooltip><TooltipTrigger asChild>{badge}</TooltipTrigger><TooltipContent className="max-w-72">{resultMeaning[record.result]}</TooltipContent></Tooltip> : badge
}

function Headers({ headers }: { headers: ExecutionRecord['rule']['headers'] }) {
  return <dl className="execution-headers">{headers.map((header, index) => <div key={index}><dt>{header.key}</dt><dd>{header.value || '(empty value)'}</dd></div>)}</dl>
}

function CapturedValue({ value, label, expandable = false }: { value: string; label: string; expandable?: boolean }) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [finding, setFinding] = useState(false)
  const [query, setQuery] = useState('')
  const [activeMatch, setActiveMatch] = useState(0)
  const [searchJump, setSearchJump] = useState(0)
  const card = useRef<HTMLDivElement | null>(null)
  const input = useRef<HTMLInputElement | null>(null)
  const findButton = useRef<HTMLButtonElement | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const preview = useMemo(() => expandable ? previewCapturedCode(value) : undefined, [expandable, value])
  const displayed = preview && !expanded ? preview.text : value
  const parts = useMemo(() => expandable ? highlightCapturedJson(displayed) : [{ text: displayed }], [expandable, displayed])
  const search = useMemo(() => findCapturedText(value, query), [value, query])
  const decorated = useMemo(() => decorateCapturedCode(parts, search.matches), [parts, search])
  const lines = useMemo(() => expandable && displayed.length <= 64_000 && (expanded || !preview?.truncated ? preview?.totalLines ?? 1 : preview.shownLines) <= 2_000 ? capturedCodeLines(decorated) : undefined, [expandable, displayed, decorated, expanded, preview])
  useEffect(() => () => clearTimeout(timer.current), [])
  useLayoutEffect(() => {
    if (!finding || !search.matches.length) return
    const mark = card.current?.querySelector(`[data-match-index="${activeMatch}"]`)
    const content = card.current?.closest('.execution-content')
    const bar = card.current?.querySelector('.execution-value-bar')
    if (mark && content && bar) {
      content.scrollTop += mark.getBoundingClientRect().top - content.getBoundingClientRect().top - bar.getBoundingClientRect().height - 20
    }
  }, [finding, search, activeMatch, searchJump])
  function openFind() {
    setFinding(true)
    setExpanded(true)
    requestAnimationFrame(() => input.current?.focus({ preventScroll: true }))
  }
  function closeFind() {
    setFinding(false)
    setQuery('')
    findButton.current?.focus({ preventScroll: true })
  }
  function nextMatch(direction: number) {
    if (!search.matches.length) return
    setActiveMatch(index => (index + direction + search.matches.length) % search.matches.length)
    setSearchJump(step => step + 1)
  }
  const renderPart = (part: CapturedCodePart, index: number) => part.matchIndex !== undefined ? <mark key={index} className="execution-search-hit" data-match-index={part.matchIndex} data-current={part.matchIndex === activeMatch ? 'true' : undefined}>{part.text}</mark> : part.className ? <span key={index} className={part.className}>{part.text}</span> : part.text
  return <div ref={card} className="execution-value" data-finding={finding ? 'true' : undefined} onKeyDown={event => {
    if (expandable && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); openFind() }
  }}>
    <div className="execution-value-bar"><span>{label}{preview && value && <span className="execution-value-size">{!expanded && preview.truncated ? preview.partialLine ? `Preview · first ${new TextEncoder().encode(displayed).length.toLocaleString()} bytes` : `Showing first ${preview.shownLines} of ${preview.totalLines} lines` : `${preview.totalLines.toLocaleString()} ${preview.totalLines === 1 ? 'line' : 'lines'}`}</span>}</span><div className="flex items-center gap-1">
    {expandable && value && <Button ref={findButton} variant="quiet" size="sm" aria-expanded={finding} onClick={() => finding ? closeFind() : openFind()}><Icon icon={Search} data-icon="inline-start" />Find</Button>}
    {preview?.truncated && <Button variant="quiet" size="sm" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>{expanded ? 'Collapse body' : 'Show full body'}</Button>}
    <Tooltip><TooltipTrigger asChild><Button variant="quiet" size="sm" aria-label={expandable ? 'Copy full body' : `Copy ${label.toLowerCase()}`} onClick={async () => {
      try {
        await navigator.clipboard.writeText(value)
        setError(false)
        setCopied(true)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(false), 2000)
      } catch { setCopied(false); setError(true) }
    }}><Icon icon={copied ? Check : Copy} data-icon="inline-start" />{expandable ? copied ? 'Copied full body' : 'Copy full body' : copied ? 'Copied' : 'Copy'}</Button></TooltipTrigger><TooltipContent>Copy {expandable ? 'full body' : label.toLowerCase()}</TooltipContent></Tooltip></div>
    {finding && <div className="execution-find"><Input ref={input} aria-label="Find in response body" placeholder="Find text" value={query} className="h-[30px] py-0" onChange={event => { setQuery(event.target.value); setActiveMatch(0) }} onKeyDown={event => {
      if (event.key === 'Enter') { event.preventDefault(); nextMatch(event.shiftKey ? -1 : 1) }
      if (event.key === 'Escape') { event.preventDefault(); closeFind() }
    }} /><span className="execution-find-count" role="status">{query ? search.matches.length ? `${activeMatch + 1} of ${search.matches.length}${search.hasMore ? '+' : ''}` : 'No matches' : ''}</span><Tooltip><TooltipTrigger asChild><Button variant="quiet" size="icon-sm" aria-label="Previous match" disabled={!search.matches.length} onClick={() => nextMatch(-1)}><Icon icon={ChevronUp} /></Button></TooltipTrigger><TooltipContent>Previous match</TooltipContent></Tooltip><Tooltip><TooltipTrigger asChild><Button variant="quiet" size="icon-sm" aria-label="Next match" disabled={!search.matches.length} onClick={() => nextMatch(1)}><Icon icon={ChevronDown} /></Button></TooltipTrigger><TooltipContent>Next match</TooltipContent></Tooltip><Tooltip><TooltipTrigger asChild><Button variant="quiet" size="icon-sm" aria-label="Close find" onClick={closeFind}><Icon icon={X} /></Button></TooltipTrigger><TooltipContent>Close find</TooltipContent></Tooltip></div>}
    <span role="status" className={error ? 'execution-copy-error' : 'sr-only'}>{error ? 'Copy failed. Select the text to copy it.' : copied ? 'Copied to clipboard' : ''}</span></div>
    <pre className="execution-code" tabIndex={0} aria-label={label} style={{ '--execution-line-width': `${String(preview?.totalLines ?? 1).length}ch` } as CSSProperties}>{value === '' ? '(empty body)' : lines ? lines.map((line, index) => <span key={index} className="execution-code-line"><span className="execution-line-number" aria-hidden="true">{index + 1}</span><span className="execution-line-text">{line.map(renderPart)}</span></span>) : decorated.map(renderPart)}</pre>
    {preview?.truncated && <div className="execution-value-footer"><Button variant="quiet" size="sm" onClick={() => setExpanded(value => !value)}>{expanded ? 'Back to preview' : 'Show full body'}</Button></div>}
  </div>
}

function ExecutionDetails({ record, observations, onClose }: { record: ExecutionRecord; observations: readonly RequestObservation[]; onClose: () => void }) {
  const [observationId, setObservationId] = useState<string>()
  const [detailTab, setDetailTab] = useState('changes')
  const [headersOpen, setHeadersOpen] = useState((record.response?.headers.length ?? 0) <= 4)
  const heading = useRef<HTMLHeadingElement | null>(null)
  useLayoutEffect(() => {
    heading.current?.focus({ preventScroll: true })
  }, [])
  useLayoutEffect(() => {
    const content = heading.current?.closest('.execution-inspector')?.querySelector('.execution-content[data-state="active"]')
    if (content) content.scrollTop = 0
  }, [detailTab])
  function chooseDetailTab(value: string) {
    setDetailTab(value)
  }
  const observation = observations.find(item => item.id === observationId)
  return <aside className="execution-inspector flex min-h-0 min-w-0 flex-col" aria-label="Execution inspector">
    <Tabs value={detailTab} className="execution-detail-tabs min-w-0 flex-1 gap-0" onValueChange={chooseDetailTab}>
    <div className="execution-detail-heading">
    <div className="flex shrink-0 items-start gap-3 px-5 pt-3 pb-2">
      <Tooltip><TooltipTrigger asChild><Button variant="ghost-muted" size="icon-sm" aria-label="Close execution inspector" onClick={onClose}><Icon icon={X} /></Button></TooltipTrigger><TooltipContent>Close execution inspector</TooltipContent></Tooltip>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3"><h2 ref={heading} tabIndex={-1} className="min-w-0 flex-1 text-base leading-relaxed font-semibold outline-none wrap-anywhere"><Tooltip><TooltipTrigger asChild><span tabIndex={0} className="rounded-sm focus-visible:outline-2 focus-visible:outline-ring">{record.rule.name || 'Unnamed rule'}</span></TooltipTrigger><TooltipContent className="max-w-[min(560px,calc(100vw-24px))] wrap-anywhere">{record.rule.name || 'Unnamed rule'}</TooltipContent></Tooltip></h2><Result record={record} explain /></div>
      <div className="execution-detail-meta flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground"><RuleKind kind={record.rule.kind} />{record.rule.option && <><span className="execution-meta-dot" aria-hidden="true" /><span className="truncate">{record.rule.option}</span></>}<span className="execution-meta-dot" aria-hidden="true" /><time className="tabular-nums" dateTime={new Date(record.time).toISOString()}>{clockTime(record.time)}</time></div>
      </div>
    </div>
      <div className="execution-detail-navigation"><TabsList variant="underline" className="w-auto shrink-0"><TabsTrigger value="changes">{record.rule.kind === 'network-rule' ? 'Changes' : 'Headers'}</TabsTrigger><TabsTrigger value="request">Request</TabsTrigger><TabsTrigger value="rule">Rule</TabsTrigger></TabsList></div>
    </div>
      <TabsContent value="changes" className="execution-content">
        <div className="flex flex-col gap-5">
          {record.result === 'Failed' && <Alert variant="failure"><Icon icon={CircleAlert} /><AlertTitle>{record.error || 'Rule execution failed'}</AlertTitle><AlertDescription><Button variant="outline" size="sm" className="my-2" onClick={() => chooseDetailTab('request')}>View request details<Icon icon={ChevronRight} data-icon="inline-end" /></Button><p className="execution-note">No mocked response delivered. The failure stage was not recorded.</p></AlertDescription></Alert>}
          {record.rule.kind !== 'network-rule' ? <>
            <section className="flex flex-col gap-3"><div className="flex flex-col gap-1"><h3 className="execution-section-title">Configured request headers</h3><p className="execution-note">Applied values were not captured. Overlapping rules may apply only some of these headers.</p></div><Headers headers={record.rule.headers} /></section>
          </> : <>
            {record.result !== 'Failed' && <dl className="execution-fields"><dt>Returned status</dt><dd>{record.response?.status ?? 'Not captured'}</dd><dt>Origin server</dt><dd>{record.rule.mode === 'bypass' ? 'Bypassed' : 'Called before replacement'}</dd></dl>}
            {record.response && <>
              <details className="execution-response-headers" open={headersOpen} onToggle={event => setHeadersOpen(event.currentTarget.open)}><summary><Icon icon={Play} size={12} fill="currentColor" strokeWidth={0} /><span className="execution-response-label">Response headers</span></summary><div className="pt-3">{record.response.headers.length ? <Headers headers={record.response.headers} /> : <p className="execution-note">No configured response headers</p>}</div></details>
              <section className="flex min-w-0 flex-col gap-3">{record.response.bodyOmitted ? <Alert><AlertDescription>{record.response.bodyOmitted}</AlertDescription></Alert> : record.response.body !== undefined ? <CapturedValue value={record.response.body} label="Response body" expandable /> : <p className="execution-note">Response body not captured</p>}</section>
            </>}
          </>}
        </div>
      </TabsContent>
      <TabsContent value="request" className="execution-content"><div className="flex flex-col gap-5">
        {record.request ? <>
          <CapturedValue value={record.request.url} label="Request URL" />
          <dl className="execution-fields"><dt>Method</dt><dd>{record.request.method}</dd><dt>Type</dt><dd>{record.request.type ?? 'Not captured'}</dd><dt>Started</dt><dd>{calendarTime(record.startedAt)}</dd></dl>
        </> : <section className="execution-value"><div className="execution-value-bar"><h3>Request details unavailable</h3></div><div className="flex flex-col gap-4 p-4"><p className="execution-note">Chrome reported this rule match without a request reference.</p><dl className="execution-fields"><dt>Matched at</dt><dd>{calendarTime(record.time)}</dd></dl></div></section>}
        {record.source === 'chrome' && observations.length > 0 && <>
          <Separator />
          <section className="flex min-w-0 flex-col gap-3"><h3 className="execution-section-title">Request observations</h3>
          <p className="execution-note">Other request observations from this tab. These are not linked to this match.</p>
          <div className="flex min-w-0 flex-col gap-2"><Label htmlFor="observed-request" className="sr-only">Separate request observations</Label><Select value={observationId ?? ''} onValueChange={setObservationId}><SelectTrigger id="observed-request" className="w-full min-w-0"><SelectValue placeholder="Choose an observed request" /></SelectTrigger><SelectContent><SelectGroup>
            {observations.slice(-200).map(item => <SelectItem key={item.id} value={item.id}>{item.method} {item.url}</SelectItem>)}
          </SelectGroup></SelectContent></Select></div>
          </section>
          {observation && <>
            <p className="execution-code">{observation.method} {observation.url}</p>
            <Table><TableHeader><TableRow interactive={false}><TableHead>Header</TableHead><TableHead>Before</TableHead><TableHead>Before send</TableHead></TableRow></TableHeader><TableBody>
              {[...new Set([...(observation.before ?? []), ...(observation.after ?? [])].map(header => header.key.toLowerCase()))].map(name => <TableRow key={name} interactive={false}>
                <TableCell className="whitespace-normal wrap-anywhere"><code>{name}</code></TableCell>
                {(['before', 'after'] as const).map(stage => <TableCell key={stage} className="whitespace-normal wrap-anywhere"><code>{observation[stage] === undefined ? 'Not captured' : observation[stage]!.filter(header => header.key.toLowerCase() === name).map(header => header.value).join('\n') || '(not in captured headers)'}</code></TableCell>)}
              </TableRow>)}
            </TableBody></Table>
          </>}
        </>}
      </div></TabsContent>
      <TabsContent value="rule" className="execution-content"><div className="flex flex-col gap-5">
        <section className="flex flex-col gap-3"><h3 className="execution-section-title">Match conditions</h3><dl className="execution-fields"><dt>Website</dt><dd>{getDomainPatterns(record.rule.url).join(', ')}</dd>{record.rule.requestUrl && <><dt>Request URL</dt><dd>{record.rule.requestUrl}</dd></>}{record.rule.method && <><dt>Method</dt><dd>{record.rule.method}</dd></>}</dl></section>
        {record.rule.kind === 'network-rule' ? <section className="flex flex-col gap-3"><h3 className="execution-section-title">Response settings</h3><dl className="execution-fields"><dt>Origin server</dt><dd>{record.rule.mode === 'bypass' ? 'Bypassed' : 'Called before replacement'}</dd><dt>Status</dt><dd>{record.rule.status ?? 'Not captured'}</dd></dl></section> : <section className="flex flex-col gap-3"><h3 className="execution-section-title">Configured headers</h3><Headers headers={record.rule.headers} /></section>}
        <p className="execution-note">A snapshot from this execution. Later rule edits do not change these settings.</p>
        <details className="execution-snapshot"><summary>View full rule snapshot</summary><pre className="execution-code mt-3">{JSON.stringify(record.rule, null, 2)}</pre></details>
      </div></TabsContent>
    </Tabs>
  </aside>
}

export function ExecutionsPanel({ controller }: { controller?: ExecutionController }) {
  const state = useSyncExternalStore(controller?.subscribe ?? subscribeEmpty, controller?.getSnapshot ?? getEmpty)
  const [selectedId, setSelectedId] = useState<string>()
  const [shown, setShown] = useState(200)
  const [listHidden, setListHidden] = useState(() => {
    try { return localStorage.getItem(listPreferenceKey) !== 'shown' }
    catch { return true }
  })
  const selectedButton = useRef<HTMLButtonElement | null>(null)
  const listElement = useRef<HTMLElement | null>(null)
  const listScrollTop = useRef(0)
  const selected = state.records.find(record => record.id === selectedId)
  const visible = state.records.slice(-shown)
  useEffect(() => {
    try { localStorage.setItem(listPreferenceKey, listHidden ? 'hidden' : 'shown') }
    catch { /* The choice still lasts for this panel when storage is unavailable. */ }
  }, [listHidden])
  useLayoutEffect(() => {
    const list = listElement.current
    if (list?.clientHeight) list.scrollTop = listScrollTop.current
  }, [selectedId, listHidden])
  function closeInspector() {
    setSelectedId(undefined)
    requestAnimationFrame(() => {
      selectedButton.current?.focus({ preventScroll: true })
    })
  }
  return <TooltipProvider delayDuration={350}><div className="execution-panel flex min-h-0 min-w-0 flex-1 flex-col gap-3">
    {state.notice && <Alert className="shrink-0"><AlertDescription>{state.notice}</AlertDescription></Alert>}
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border">
    <div className="execution-toolbar flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2" role="group" aria-label="Execution history controls">
      <div className="flex items-center gap-3"><h2 className="text-xs font-semibold">{state.records.length} {state.records.length === 1 ? 'execution' : 'executions'}</h2>{selected && <Button variant="quiet" size="sm" className="max-[900px]:hidden" aria-expanded={!listHidden} aria-controls="execution-list" onClick={() => setListHidden(value => !value)}><Icon icon={listHidden ? PanelLeftOpen : PanelLeftClose} data-icon="inline-start" />{listHidden ? 'Show list' : 'Hide list'}</Button>}</div>
      <div className="flex items-center gap-2">
        <Button variant="outline" className="execution-recording-toggle" aria-label="Record executions" aria-pressed={!!controller && !state.paused} disabled={!controller} onClick={() => state.paused ? controller?.resume() : controller?.pause()}><span className="execution-recording-state" aria-hidden="true"><span className={cn('size-1.5 rounded-full bg-success', (!controller || state.paused) && 'bg-muted-foreground')} />{!controller ? 'Connecting' : state.paused ? 'Paused' : 'Recording'}</span><span className="execution-recording-action" aria-hidden="true"><Icon icon={state.paused ? Play : Pause} data-icon="inline-start" />{state.paused ? 'Resume' : 'Pause'}</span></Button><span className="sr-only" role="status">{!controller ? 'Connecting' : state.paused ? 'Paused' : 'Recording'}</span>
        <Tooltip><TooltipTrigger asChild><Button variant="outline" aria-label="Clear executions" disabled={!controller || !state.records.length && !state.observations.length} onClick={() => { controller?.clear(); setSelectedId(undefined) }}><Icon icon={Trash2} data-icon="inline-start" /><span className="max-[480px]:sr-only">Clear</span></Button></TooltipTrigger><TooltipContent>Clear executions</TooltipContent></Tooltip>
        <MemoryUsage bytes={state.bytes} budget={EXECUTION_HISTORY_BYTES} label="Execution memory"><p className="text-xs text-muted-foreground">Oldest executions are removed when the memory limit is reached.</p></MemoryUsage>
      </div>
    </div>
    <div className="execution-workspace min-h-0 flex-1" role="region" aria-label="Execution workspace">
    <div className={cn('execution-columns', selected && 'has-inspector', selected && listHidden && 'details-only')}>
      <section ref={listElement} id="execution-list" className="execution-list flex min-h-0 min-w-0 flex-col" tabIndex={0} aria-label="Executions" onScroll={event => { if (event.currentTarget.clientHeight) listScrollTop.current = event.currentTarget.scrollTop }}>
        {state.records.length ? <div className="flex flex-1 flex-col" role="group" aria-label="Execution activity">
          {state.records.length > visible.length && <Button variant="ghost" onClick={() => setShown(value => value + 200)}>Show earlier executions ({state.records.length - visible.length})</Button>}
          {visible.map(record => <Tooltip key={record.id}><TooltipTrigger asChild><Button variant="execution" size="execution" aria-pressed={record.id === selectedId} onClick={event => { selectedButton.current = event.currentTarget; listScrollTop.current = event.currentTarget.closest('.execution-list')?.scrollTop ?? 0; setSelectedId(record.id) }}>
            <span className="flex min-w-0 flex-1 flex-col gap-1"><span className="execution-row-title truncate text-sm font-medium">{record.rule.name || 'Unnamed rule'}</span><span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground"><time className="shrink-0 tabular-nums" dateTime={new Date(record.time).toISOString()}>{clockTime(record.time)}</time><span className="execution-meta-dot" aria-hidden="true" /><span className="flex min-w-0 items-center gap-2"><RuleKind kind={record.rule.kind} />{record.rule.option && <><span className="execution-meta-dot" aria-hidden="true" /><span className="truncate">{record.rule.option}</span></>}</span></span></span>
            <Result record={record} />
          </Button></TooltipTrigger><TooltipContent className="flex max-w-[min(560px,calc(100vw-24px))] flex-col gap-1 wrap-anywhere"><span>{record.rule.name || 'Unnamed rule'}</span><span>{resultMeaning[record.result]}</span></TooltipContent></Tooltip>)}
        </div> : <Empty><EmptyHeader><EmptyMedia variant="icon"><Icon icon={Activity} /></EmptyMedia><EmptyTitle>No executions yet</EmptyTitle><EmptyDescription>Make a request on the inspected page that matches an enabled rule.</EmptyDescription></EmptyHeader></Empty>}
        {selectedId && !selected && <p className="execution-note border-t p-4" role="status">The selected execution was removed from history. Select another execution.</p>}
      </section>
      {selected && <ExecutionDetails key={selected.id} record={selected} observations={state.observations} onClose={closeInspector} />}
    </div>
    </div>
    </div>
    {state.removed > 0 && <footer className="shrink-0 text-xs text-muted-foreground">{state.removed} removed</footer>}
  </div></TooltipProvider>
}
