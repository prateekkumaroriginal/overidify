import { useEffect, useRef, useState } from 'react'
import { Ban, Eraser, FileX2, Radio, RefreshCw, Search, Settings, SquareArrowOutUpRight, Trash2 } from 'lucide-react'
import { DEVTOOLS_BODY_BUDGET_BYTES, DevtoolsResponseUnavailableError, devtoolsRequestLabel, devtoolsRequestUnsupportedReason, observeDevtoolsRequests } from '../lib/devtools-requests'
import type { CapturedRequest } from '../lib/devtools-requests'
import { openCapturedNetworkRule } from '../lib/network-rule-drafts'
import { Alert, AlertDescription } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Checkbox } from '../components/ui/checkbox'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '../components/ui/empty'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from '../components/ui/popover'
import { Progress } from '../components/ui/progress'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Spinner } from '../components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip'
import { Icon } from '../components/Icon'
import { Brand } from '../components/Brand'
import { cn } from '../lib/utils'

type DisplayPreferences = { rows: 'one' | 'two'; fullPath: boolean; showUnsupported: boolean }
const preferenceKey = 'overidify:devtools-display:v1'
const tooltipDelayDuration = 350

function readDisplayPreferences(): DisplayPreferences {
  try {
    const value = JSON.parse(localStorage.getItem(preferenceKey) ?? '{}') as Partial<DisplayPreferences> | null
    return { rows: value?.rows === 'one' ? 'one' : 'two', fullPath: value?.fullPath === true, showUnsupported: value?.showUnsupported === true }
  } catch { return { rows: 'two', fullPath: false, showUnsupported: false } }
}

export function DevtoolsApp() {
  const [requests, setRequests] = useState<CapturedRequest[]>([])
  const [retainedBodyBytes, setRetainedBodyBytes] = useState(0)
  const [search, setSearch] = useState('')
  const [display, setDisplay] = useState(readDisplayPreferences)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [memoryPopover, setMemoryPopover] = useState<'closed' | 'hover' | 'pinned'>('closed')
  const memoryOpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const memoryCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const restoreMemoryFocus = useRef(false)
  const opening = useRef(false)
  const capture = useRef<ReturnType<typeof observeDevtoolsRequests> | null>(null)

  useEffect(() => () => {
    if (memoryOpenTimer.current !== null) clearTimeout(memoryOpenTimer.current)
    if (memoryCloseTimer.current !== null) clearTimeout(memoryCloseTimer.current)
  }, [])

  function cancelMemoryTimers() {
    if (memoryOpenTimer.current !== null) clearTimeout(memoryOpenTimer.current)
    if (memoryCloseTimer.current !== null) clearTimeout(memoryCloseTimer.current)
    memoryOpenTimer.current = null
    memoryCloseTimer.current = null
  }

  function showMemoryOnHover() {
    cancelMemoryTimers()
    if (memoryPopover === 'closed') {
      restoreMemoryFocus.current = false
      memoryOpenTimer.current = setTimeout(() => {
        memoryOpenTimer.current = null
        setMemoryPopover(current => current === 'closed' ? 'hover' : current)
      }, tooltipDelayDuration)
    }
  }

  function scheduleMemoryClose() {
    cancelMemoryTimers()
    if (memoryPopover !== 'hover') return
    memoryCloseTimer.current = setTimeout(() => {
      memoryCloseTimer.current = null
      setMemoryPopover(current => current === 'hover' ? 'closed' : current)
    }, 150)
  }

  function pinMemoryPopover() {
    cancelMemoryTimers()
    restoreMemoryFocus.current = true
    setMemoryPopover('pinned')
  }

  useEffect(() => {
    const pageUrl = chrome.tabs.get(chrome.devtools.inspectedWindow.tabId).then(tab => tab.url ?? '').catch(() => '')
    const observer = observeDevtoolsRequests(chrome.devtools.network, (requests, bytes) => {
      setRequests(requests)
      setRetainedBodyBytes(bytes)
    }, pageUrl)
    capture.current = observer
    const refresh = () => observer.refresh()
    window.addEventListener('overidify-devtools-shown', refresh)
    return () => { window.removeEventListener('overidify-devtools-shown', refresh); observer.dispose(); capture.current = null }
  }, [])

  useEffect(() => {
    try { localStorage.setItem(preferenceKey, JSON.stringify(display)) }
    catch { /* Display controls still work when preferences cannot be stored. */ }
  }, [display])

  async function createRule(item: CapturedRequest) {
    if (opening.current) return
    opening.current = true
    setOpeningId(item.id)
    setError('')
    try {
      await openCapturedNetworkRule(item.request, await item.pageUrl)
    } catch (reason) {
      if (reason instanceof DevtoolsResponseUnavailableError) capture.current?.markUnavailable(item.id, reason.message)
      else setError(reason instanceof Error ? reason.message : 'Could not open this response in options. Try again.')
    } finally { opening.current = false; setOpeningId(null) }
  }

  const query = search.trim().toLowerCase()
  const matching = requests.filter(({ request }) => `${request.request.method} ${request.request.url}`.toLowerCase().includes(query))
    .map(item => ({ ...item, unsupportedReason: item.unavailableReason ?? devtoolsRequestUnsupportedReason(item.request) }))
  const visible = display.showUnsupported ? matching : matching.filter(item => !item.unsupportedReason)
  const hiddenUnsupported = matching.length - visible.length
  const memoryPercent = retainedBodyBytes / DEVTOOLS_BODY_BUDGET_BYTES * 100

  return (
    <TooltipProvider delayDuration={tooltipDelayDuration}>
      <main className="mx-auto flex h-dvh min-w-0 max-w-[1240px] flex-col gap-5 p-5 mobile:p-4">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b pb-4">
          <Brand href="options.html" openInTab />
          <Button variant="outline" onClick={() => { void chrome.runtime.openOptionsPage() }}><Icon icon={Settings} data-icon="inline-start" />Manage rules</Button>
        </header>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1 basis-40 mobile:basis-full">
            <Icon icon={Search} size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-[30px] py-0 pl-9" aria-label="Filter requests" placeholder="Filter by URL or method" value={search} onChange={event => setSearch(event.target.value)} />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" onClick={() => capture.current?.refresh()}><Icon icon={RefreshCw} data-icon="inline-start" />Refresh</Button>
            <Button variant="outline" onClick={() => { capture.current?.clear(); setError('') }}><Icon icon={Trash2} data-icon="inline-start" />Clear</Button>
            <Popover open={memoryPopover !== 'closed'} onOpenChange={open => {
              if (open) pinMemoryPopover()
              else { cancelMemoryTimers(); setMemoryPopover('closed') }
            }}>
              <PopoverTrigger asChild>
                <Button variant="ghost-muted" size="icon" aria-label={`Response memory: ${Math.round(memoryPercent)}% used`}
                  onPointerEnter={event => { if (event.pointerType !== 'touch') showMemoryOnHover() }} onPointerLeave={scheduleMemoryClose}
                  onClick={event => { event.preventDefault(); pinMemoryPopover() }}>
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="-rotate-90">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.2" />
                    {retainedBodyBytes > 0 && <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - memoryPercent} />}
                  </svg>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" sideOffset={8} collisionPadding={8} className="flex w-80 max-w-[calc(100vw-32px)] flex-col gap-3" aria-labelledby="response-memory-title"
                onPointerEnter={event => { if (event.pointerType !== 'touch') showMemoryOnHover() }} onPointerLeave={scheduleMemoryClose}
                onClick={pinMemoryPopover}
                onOpenAutoFocus={event => { if (!restoreMemoryFocus.current) event.preventDefault() }}
                onCloseAutoFocus={event => { if (!restoreMemoryFocus.current) event.preventDefault() }}>
                <PopoverHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <PopoverTitle id="response-memory-title">Response memory</PopoverTitle>
                    <span className="text-[11px] tabular-nums text-muted-foreground">{Math.round(memoryPercent)}% · {(retainedBodyBytes / 1024 / 1024).toFixed(1)} / {DEVTOOLS_BODY_BUDGET_BYTES / 1024 / 1024} MiB</span>
                  </div>
                </PopoverHeader>
                <Progress className="h-1.5" aria-label="Retained response body memory" value={memoryPercent} />
                <Button variant="outline" disabled={retainedBodyBytes === 0} onClick={() => { capture.current?.releaseBodies(); setError('') }}><Icon icon={Eraser} data-icon="inline-start" />Release response bodies</Button>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-5">
          <div className="flex items-center gap-2">
            <Label htmlFor="request-rows" size="sm">Rows</Label>
            <Select value={display.rows} onValueChange={value => setDisplay(current => ({ ...current, rows: value === 'one' ? 'one' : 'two' }))}>
              <SelectTrigger id="request-rows" size="toolbar" className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>
                <SelectItem value="one">One line</SelectItem>
                <SelectItem value="two">Two lines</SelectItem>
              </SelectGroup></SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="request-full-path" checked={display.fullPath} onCheckedChange={checked => setDisplay(current => ({ ...current, fullPath: checked === true }))} />
            <Label htmlFor="request-full-path" size="sm">Full path</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="request-show-unsupported" checked={display.showUnsupported} onCheckedChange={checked => setDisplay(current => ({ ...current, showUnsupported: checked === true }))} />
            <Label htmlFor="request-show-unsupported" size="sm">Show unsupported</Label>
          </div>
        </div>
        {error && <Alert variant="destructive" className="shrink-0"><AlertDescription>{error}</AlertDescription></Alert>}
        <section className={cn('flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden', visible.length && 'rounded-lg border bg-card shadow-rule-card')} aria-label="Captured requests">
          {visible.length ? <Table className="table-fixed" containerClassName="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
            <colgroup><col className="w-[88px] mobile:w-[80px]" /><col /><col className="w-[76px] mobile:w-[64px]" /><col className="w-[66px] mobile:w-[58px]" /></colgroup>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow interactive={false}>
                <TableHead className="px-5 text-center mobile:px-4">Method</TableHead>
                <TableHead className="px-5 mobile:px-4">Request</TableHead>
                <TableHead className="px-5 text-center mobile:px-4">Status</TableHead>
                <TableHead className="px-5 mobile:px-4"><span className="sr-only">Create rule</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map(item => {
                const request = item.request
                const label = devtoolsRequestLabel(request.request.url, display.fullPath)
                return <TableRow key={item.id} className={cn('group/request cursor-default', display.rows === 'one' && '[&_td]:py-1')}>
                  <TableCell className="px-5 text-center mobile:px-4"><span className="text-[11px] text-muted-foreground">{request.request.method}</span></TableCell>
                  <TableCell className={cn('px-5 mobile:px-4', display.rows === 'two' ? 'py-3' : 'py-1')}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span tabIndex={0} className="flex w-full min-w-0 flex-col gap-0.5 text-left focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4">
                          <span className="w-full truncate font-semibold">{label.name}</span>
                          {display.rows === 'two' && <span className="w-full truncate text-[11px] text-muted-foreground">{label.host}</span>}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[min(560px,calc(100vw-24px))] wrap-anywhere">{request.request.url}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="px-5 text-center mobile:px-4"><span className={cn('text-[11px] tabular-nums text-muted-foreground', (!request.response.status || request.response.status >= 400) && 'text-destructive')}>{request.response.status || 'Failed'}</span></TableCell>
                  <TableCell className="px-5 mobile:px-4">
                    <div className={cn('flex items-center', !item.bodyReleasedReason && 'pointer-events-none opacity-0 group-hover/request:pointer-events-auto group-hover/request:opacity-100 group-has-[:focus-visible]/request:pointer-events-auto group-has-[:focus-visible]/request:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100')}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          {item.bodyReleasedReason ? <Button asChild variant="ghost-muted" size="icon-action">
                            <span tabIndex={0} role="img" aria-label={`Response body released for ${request.request.method} ${label.name}`} className="focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4"><Icon icon={FileX2} /></span>
                          </Button> : item.unsupportedReason ? <span tabIndex={0} role="button" aria-disabled="true" aria-label={`Cannot create rule for ${request.request.method} ${label.name}`} className="inline-flex rounded-[5px] focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4">
                            <Button variant="ghost-muted" size="icon-action" disabled aria-hidden="true" className="pointer-events-none"><Icon icon={SquareArrowOutUpRight} /></Button>
                          </span> : <Button variant="ghost-muted" size="icon-action" disabled={openingId !== null} aria-busy={openingId === item.id} aria-label={`Create rule in options for ${request.request.method} ${label.name}`} onClick={() => { void createRule(item) }}>
                              {openingId === item.id ? <Spinner /> : <Icon icon={SquareArrowOutUpRight} />}
                            </Button>}
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[min(360px,calc(100vw-24px))] wrap-anywhere">{item.bodyReleasedReason ?? item.unsupportedReason ?? 'Create rule in options'}</TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              })}
            </TableBody>
          </Table> : <Empty className="border"><EmptyHeader>
            <EmptyMedia variant="icon"><Icon icon={query ? Search : hiddenUnsupported ? Ban : Radio} /></EmptyMedia>
            <EmptyTitle>{query ? 'No matching requests' : hiddenUnsupported ? 'No supported requests' : 'Waiting for API requests'}</EmptyTitle>
            {hiddenUnsupported > 0 && <EmptyDescription>{hiddenUnsupported} unsupported {hiddenUnsupported === 1 ? 'request is' : 'requests are'} hidden.</EmptyDescription>}
          </EmptyHeader></Empty>}
        </section>
      </main>
    </TooltipProvider>
  )
}
