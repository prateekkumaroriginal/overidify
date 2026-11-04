import { useState, useSyncExternalStore } from 'react'
import { Activity, Pause, Play, Trash2 } from 'lucide-react'
import type { ExecutionRecord, ExecutionSnapshot, RequestObservation } from '../lib/execution-history'
import type { ExecutionController } from './executions'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Alert, AlertDescription } from '../components/ui/alert'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '../components/ui/empty'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Separator } from '../components/ui/separator'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Label } from '../components/ui/label'
import { Icon } from '../components/Icon'

const empty: ExecutionSnapshot = { records: [], observations: [], bytes: 0, removed: 0, paused: false, notice: '' }
const getEmpty = () => empty
const subscribeEmpty = () => () => undefined
const ruleType = { 'header-rule': 'Header Rule', 'switch-rule': 'Switch Rule', 'network-rule': 'Network Rule' }

function ExecutionDetails({ record, observations }: { record: ExecutionRecord; observations: readonly RequestObservation[] }) {
  const [observationId, setObservationId] = useState<string>()
  const observation = observations.find(item => item.id === observationId)
  return <aside className="flex min-h-0 min-w-0 flex-col" aria-label="Execution inspector">
    <div className="flex flex-col gap-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold wrap-anywhere">{record.rule.name || 'Unnamed rule'}</h2><Badge variant="secondary">{record.result}</Badge></div>
      <p className="text-[11px] text-muted-foreground">{ruleType[record.rule.kind]}{record.rule.option && ` · ${record.rule.option}`} · {new Date(record.time).toLocaleTimeString()}</p>
      <p className="text-[11px] text-muted-foreground">{record.source === 'chrome' ? 'Chrome reported this rule match. Request association and final header values were not captured.' : 'Reported by the Network interceptor.'}</p>
    </div>
    <Separator />
    <Tabs defaultValue="changes" className="min-h-0 flex-1 gap-0">
      <TabsList variant="line" className="m-3 shrink-0"><TabsTrigger value="changes">Changes</TabsTrigger><TabsTrigger value="request">Request</TabsTrigger><TabsTrigger value="rule">Rule</TabsTrigger></TabsList>
      <TabsContent value="changes" className="min-h-0 overflow-auto p-4 pt-0">
        <div className="flex flex-col gap-4">
          {record.error && <Alert variant="destructive"><AlertDescription>{record.error}</AlertDescription></Alert>}
          {record.rule.kind !== 'network-rule' ? <>
            <p className="text-[11px] text-muted-foreground">Configured request headers. A matched rule can contribute only some of its configured headers when rules overlap.</p>
            <Table><TableHeader><TableRow interactive={false}><TableHead>Header</TableHead><TableHead>Configured value</TableHead></TableRow></TableHeader><TableBody>
              {record.rule.headers.map((header, index) => <TableRow key={index} interactive={false}><TableCell><code>{header.key}</code></TableCell><TableCell className="whitespace-normal wrap-anywhere"><code>{header.value}</code></TableCell></TableRow>)}
            </TableBody></Table>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs"><dt className="text-muted-foreground">Original values</dt><dd>Not captured</dd><dt className="text-muted-foreground">Final values</dt><dd>Not captured</dd></dl>
          </> : <>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs"><dt className="text-muted-foreground">Server behavior</dt><dd>{record.rule.mode === 'bypass' ? 'Bypassed' : 'Called before replacement'}</dd><dt className="text-muted-foreground">Returned status</dt><dd>{record.response?.status ?? 'Not captured'}</dd></dl>
            {record.response && <>
              <h3 className="text-xs font-semibold">Returned headers</h3>
              {record.response.headers.length ? <dl className="flex flex-col gap-2 text-xs">{record.response.headers.map((header, index) => <div key={index} className="flex flex-col gap-1"><dt className="font-mono text-muted-foreground">{header.key}</dt><dd className="font-mono wrap-anywhere">{header.value}</dd></div>)}</dl> : <p className="text-xs text-muted-foreground">No configured response headers</p>}
              <h3 className="text-xs font-semibold">Returned body</h3>
              {record.response.bodyOmitted ? <Alert><AlertDescription>{record.response.bodyOmitted}</AlertDescription></Alert> : <pre className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 font-mono text-[11px] wrap-anywhere">{record.response.body === '' ? '(empty body)' : record.response.body ?? 'Not captured'}</pre>}
            </>}
          </>}
        </div>
      </TabsContent>
      <TabsContent value="request" className="min-h-0 overflow-auto p-4 pt-0"><div className="flex flex-col gap-4"><dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 text-xs">
        <dt className="text-muted-foreground">URL</dt><dd className="font-mono wrap-anywhere">{record.request?.url ?? 'Not captured'}</dd>
        <dt className="text-muted-foreground">Method</dt><dd>{record.request?.method ?? 'Not captured'}</dd>
        <dt className="text-muted-foreground">Type</dt><dd>{record.request?.type ?? 'Not captured'}</dd>
        <dt className="text-muted-foreground">Started</dt><dd>{new Date(record.startedAt).toLocaleString()}</dd>
      </dl>
        {record.source === 'chrome' && <>
          <Separator />
          <p className="text-[11px] text-muted-foreground">Chrome did not link this match to a request. You can browse separate request-header observations for this tab below. Selecting one does not associate it with this rule.</p>
          <div className="flex min-w-0 flex-col gap-2"><Label htmlFor="observed-request">Separate request observations</Label><Select value={observationId ?? ''} onValueChange={setObservationId}><SelectTrigger id="observed-request" className="w-full min-w-0"><SelectValue placeholder={observations.length ? 'Choose an observed request' : 'No retained request observations'} /></SelectTrigger><SelectContent><SelectGroup>
            {observations.slice(-200).map(item => <SelectItem key={item.id} value={item.id}>{item.method} {item.url}</SelectItem>)}
          </SelectGroup></SelectContent></Select></div>
          {observation && <>
            <p className="font-mono text-[11px] wrap-anywhere">{observation.method} {observation.url}</p>
            <Table><TableHeader><TableRow interactive={false}><TableHead>Header</TableHead><TableHead>Before</TableHead><TableHead>Before send</TableHead></TableRow></TableHeader><TableBody>
              {[...new Set([...(observation.before ?? []), ...(observation.after ?? [])].map(header => header.key.toLowerCase()))].map(name => <TableRow key={name} interactive={false}>
                <TableCell><code>{name}</code></TableCell>
                {(['before', 'after'] as const).map(stage => <TableCell key={stage} className="whitespace-normal wrap-anywhere"><code>{observation[stage] === undefined ? 'Not captured' : observation[stage]!.filter(header => header.key.toLowerCase() === name).map(header => header.value).join('\n') || '(not in captured headers)'}</code></TableCell>)}
              </TableRow>)}
            </TableBody></Table>
          </>}
        </>}
      </div></TabsContent>
      <TabsContent value="rule" className="min-h-0 overflow-auto p-4 pt-0"><div className="flex flex-col gap-3"><p className="text-[11px] text-muted-foreground">Settings captured for this execution. Later edits do not change this snapshot.</p><pre className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 font-mono text-[11px] wrap-anywhere">{JSON.stringify(record.rule, null, 2)}</pre></div></TabsContent>
    </Tabs>
  </aside>
}

export function ExecutionsPanel({ controller }: { controller?: ExecutionController }) {
  const state = useSyncExternalStore(controller?.subscribe ?? subscribeEmpty, controller?.getSnapshot ?? getEmpty)
  const [selectedId, setSelectedId] = useState<string>()
  const [shown, setShown] = useState(200)
  const selected = state.records.find(record => record.id === selectedId)
  const visible = state.records.slice(-shown)
  return <div className="flex min-h-0 flex-1 flex-col gap-3">
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground" role="status">{!controller ? 'Connecting to execution capture' : state.paused ? 'Recording paused' : 'Recording this tab'}</p>
      <div className="flex items-center gap-2"><Button variant="outline" disabled={!controller} onClick={() => state.paused ? controller?.resume() : controller?.pause()}><Icon icon={state.paused ? Play : Pause} data-icon="inline-start" />{state.paused ? 'Resume' : 'Pause'}</Button><Button variant="outline" disabled={!controller} onClick={() => { controller?.clear(); setSelectedId(undefined) }}><Icon icon={Trash2} data-icon="inline-start" />Clear</Button></div>
    </div>
    <p className="shrink-0 text-[11px] text-muted-foreground">Header and Switch confirmations arrive periodically. Unavailable details show Not captured.</p>
    {state.notice && <Alert className="shrink-0"><AlertDescription>{state.notice}</AlertDescription></Alert>}
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(280px,0.85fr)] overflow-hidden rounded-lg border bg-card max-[800px]:grid-cols-1 max-[800px]:overflow-auto">
      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden border-r max-[800px]:min-h-48 max-[800px]:border-r-0 max-[800px]:border-b" aria-label="Executions">
        {state.records.length ? <>
          {state.records.length > visible.length && <Button variant="ghost" onClick={() => setShown(value => value + 200)}>Show earlier executions ({state.records.length - visible.length})</Button>}
          <Table className="min-w-[520px]" containerClassName="min-h-0 flex-1 overflow-auto"><TableHeader className="sticky top-0 bg-card"><TableRow interactive={false}><TableHead>Time</TableHead><TableHead>Rule</TableHead><TableHead>Request</TableHead><TableHead>Result</TableHead></TableRow></TableHeader><TableBody>
            {visible.map(record => <TableRow key={record.id} data-state={record.id === selectedId ? 'selected' : undefined}>
              <TableCell><span className="font-mono text-[11px] text-muted-foreground">{new Date(record.time).toLocaleTimeString(undefined, { hour12: false })}</span></TableCell>
              <TableCell><Button variant="ghost" onClick={() => setSelectedId(record.id)} aria-pressed={record.id === selectedId}>{record.rule.name || 'Unnamed rule'}</Button><p className="px-3 text-[11px] text-muted-foreground">{ruleType[record.rule.kind]}{record.rule.option && ` · ${record.rule.option}`}</p></TableCell>
              <TableCell><span className="block max-w-48 truncate text-[11px]" title={record.request?.url}>{record.request ? `${record.request.method} ${record.request.url}` : 'Not captured'}</span></TableCell>
              <TableCell><Badge variant={record.result === 'Mocked' ? 'secondary' : 'outline'}>{record.result}</Badge></TableCell>
            </TableRow>)}
          </TableBody></Table>
        </> : <Empty><EmptyHeader><EmptyMedia variant="icon"><Icon icon={Activity} /></EmptyMedia><EmptyTitle>No executions yet</EmptyTitle><EmptyDescription>Trigger requests from this tab to record rule activity.</EmptyDescription></EmptyHeader></Empty>}
      </section>
      {selected ? <ExecutionDetails key={selected.id} record={selected} observations={state.observations} /> : <Empty><EmptyHeader><EmptyTitle>{selectedId ? 'Selected execution was removed' : 'Select an execution'}</EmptyTitle><EmptyDescription>{selectedId ? 'The history budget removed this record. Select another execution.' : 'Inspect its changes, request details, and captured rule settings.'}</EmptyDescription></EmptyHeader></Empty>}
    </div>
    <footer className="flex shrink-0 flex-wrap justify-between gap-2 text-[11px] text-muted-foreground"><span>{state.records.length} executions · {state.removed} removed</span><span>{(state.bytes / 1024 / 1024).toFixed(1)} / 50 MiB estimated history</span></footer>
  </div>
}
